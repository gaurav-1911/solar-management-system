import mongoose from "mongoose";
import Installation from "../models/installation.model.js";
import Quotation from "../models/quotation.model.js";
import ProjectApproval from "../models/projectApproval.model.js";
import ProjectProgress from "../models/projectProgress.model.js";
import Technician from "../models/technician.model.js";
import HTTP_STATUS from "../constants/httpStatus.js";
import MESSAGE from "../constants/messages.js";
import { isDocOwnedByTechnician, getSalesScope, isDocOwnedBySales, mergeSalesOwnershipFilter } from "../utils/ownershipScope.js";
// import { getLeadAllowance, resolveProductRefs, adjustProductStockWithInventory } from "../utils/stockAllocation.js";
// import { uploadFileToCloudinary, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { storedFileLength, sendStoredFile, stripFileData } from "../utils/storedFile.js";
import { getLeadAllowance, resolveProductRefs, adjustProductStockWithInventory } from "../utils/stockAllocation.js";
import { uploadFileToCloudinary, deleteCloudinaryFiles } from "../utils/cloudinaryStorage.js";
import { generateProjectId } from "./projectProgress.controller.js";
import { applyCustomerScope } from "../utils/customerScope.js";
import { validateStatusTransition } from "../utils/statusTransitions.js";
import { logActivity, computeChanges } from "../utils/activityLogger.js";
import { sendNotification, findUserIdByName } from "../utils/notify.js";
import { checkDependencies } from "../utils/dependencies.js";

// Workflow enforcement: an installation can only be created for a lead whose
// project approval is Approved. Mirrors the survey→design→quotation→approval
// chain — no approved approval → no installation.
const ensureApprovedApproval = async (leadId) => {
    if (!leadId) return null;
    const approval = await ProjectApproval.findOne({ leadId }).sort({ createdAt: -1 }).lean();
    if (!approval) return null;
    return approval.status === "Approved" ? approval : null;
};

// Derive the technician name from the selected technician ID so the stored
// technicianName always matches the Technician module even if the client
// only sends the technicianId.
// Returns false when the referenced technician does not exist (create-time guard).
const resolveTechnician = async (data) => {
    if (!data.technicianId) return true;
    const tech = await Technician.findOne({ technicianId: data.technicianId }).lean();
    if (!tech) return false;
    data.technicianName = tech.name;
    return true;
};

const generateInstallationId = async () => {
    const lastDoc = await Installation.findOne({ installationId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("installationId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.installationId) {
        const m = lastDoc.installationId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `INS-${String(max + 1).padStart(3, "0")}`;
};


const buildFileMeta = (file) => uploadFileToCloudinary(file, "installations");

const INSTALLATION_FILE_BUDGET = 14 * 1024 * 1024; // 14MB


const fileEntryBytes = (entry) => {
    if (!entry) return 0;
    if (typeof entry.size === "number" && entry.size > 0) return entry.size;
    return storedFileLength(entry?.fileData);
};

const countInstallationFileBytes = (photoFiles) => {
    let total = 0;
    (photoFiles || []).forEach((p) => {
        total += fileEntryBytes(p);
    });
    return total;
};


const adjustProductStocks = async (materials, direction) => {
    const usable = (materials || []).filter(
        (m) =>
            m &&
            typeof m === "object" &&
            m.productId &&
            m.status === "Available" &&
            Number(m.quantity) > 0
    );
    const products = await resolveProductRefs(usable.map((m) => String(m.productId)));
    await Promise.all(
        usable.map(async (m) => {
            const product = products.get(String(m.productId));
            if (!product) return;
            await adjustProductStockWithInventory(product, Number(m.quantity), direction);
        })
    );
};

// Total material cost of an installation: qty × unit price summed over the
// "Available" rows (mirrors the frontend total shown in the form).
const computeMaterialTotal = (materials) => {
    return (materials || []).reduce((sum, m) => {
        if (!m || typeof m !== "object" || m.status !== "Available") return sum;
        const qty = Number(m.quantity || 0);
        const price = Number(m.price);
        if (qty <= 0 || !Number.isFinite(price) || price <= 0) return sum;
        return sum + qty * price;
    }, 0);
};

// After an installation is created/updated, make sure the linked Project
// Progress record exists and carries the installation's total as the Actual
// Project Cost. Best-effort: a sync failure must never fail the installation
// save itself.
const syncProjectProgressFromInstallation = async (installation) => {
    try {
        if (!installation?.leadId) return;
        const total = computeMaterialTotal(installation.materials);
        const existing = await ProjectProgress.findOne({ leadId: installation.leadId }).lean();
        if (!existing) {
            // No entry yet → auto-create one (installation is the first real
            // on-ground milestone). Approved budget / GST default from the
            // lead's quotation when present.
            const quotation = await Quotation.findOne({ leadId: installation.leadId })
                .sort({ createdAt: -1 })
                .lean();
            const customerName = installation.customerName || installation.leadId;
            await ProjectProgress.create({
                projectId: await generateProjectId(),
                projectName: `${customerName} Project`,
                customerName,
                leadId: installation.leadId,
                startDate: installation.installationDate || new Date(),
                milestones: { installationStarted: "Completed" },
                completionPercentage: 11,
                approvedBudget: quotation?.total || 0,
                actualProjectCost: total,
                gstAmount: quotation?.gst || 0,
                projectStatus: "In Progress"
            });
        } else {
            // Entry exists → mark the Installation Started milestone as
            // Completed and push the latest installation total (only when
            // there is an actual cost, so a manually entered figure is never
            // wiped with 0).
            const set = { "milestones.installationStarted": "Completed" };
            if (total > 0) set.actualProjectCost = total;
            // Recompute completion % from the merged milestones so the
            // progress bar reflects the newly completed milestone.
            const merged = { ...(existing.milestones || {}), installationStarted: "Completed" };
            const msTotal = Object.keys(merged).length;
            const msDone = Object.values(merged).filter((s) => s === "Completed").length;
            if (msTotal > 0) set.completionPercentage = Math.round((msDone / msTotal) * 100);
            await ProjectProgress.updateOne(
                { _id: existing._id },
                { $set: set }
            );
        }
    } catch (error) {
        console.warn("Sync Project Progress from installation error:", error?.message);
    }
};

export const createInstallation = async (req, res) => {
    let photoFiles = [];
    try {
        // Workflow enforcement: only leads with an Approved project approval
        // can get an installation.
        const approved = await ensureApprovedApproval(req.body.leadId);
        if (!approved) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "A project approval (Approved) is required before creating an installation for this lead."
            });
        }
        // One lead = one installation: reject a second installation for a lead
        // that already has one.
        const existing = await Installation.findOne({ leadId: req.body.leadId }).lean();
        if (existing) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `An installation (${existing.installationId}) already exists for this lead.`
            });
        }

        const rawUploadBytes = (req.files?.sitePhotos || []).reduce((s, f) => s + (f.size || 0), 0);
        if (rawUploadBytes > INSTALLATION_FILE_BUDGET) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for an installation must stay under 14MB"
            });
        }
        // Upload the actual site photos (multipart/form-data via multer) to Cloudinary.
        photoFiles = await Promise.all((req.files?.sitePhotos || []).map(buildFileMeta));
        if (countInstallationFileBytes(photoFiles) > INSTALLATION_FILE_BUDGET) {
            // Files were already uploaded — remove them before rejecting.
            await deleteCloudinaryFiles(photoFiles);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for an installation must stay under 14MB"
            });
        }
        // Reject installations whose referenced technician no longer exists so
        // records never silently link to a missing technician. The client
        // sends technicianName + technicianId together; the stored name is
        // re-derived from the technician record for consistency.
        if (!(await resolveTechnician(req.body))) {
            await deleteCloudinaryFiles(photoFiles);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Selected technician not found"
            });
        }
        // No quotation-allocation limits — installations can use any product
        // that has stock in the Product Catalog (stock requests were removed).
        let body = { ...req.body, projectApprovalId: approved.approvalId };
        if (photoFiles.length > 0) body.sitePhotos = photoFiles;
        let installation;
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                body.installationId = await generateInstallationId();
                installation = await Installation.create(body);
                break;
            } catch (error) {
                if (error?.code === 11000 && attempt < 2) continue; // re-roll the ID
                throw error;
            }
        }

        // Stock deduction: quoted leads already reserved stock at quotation
        // time; legacy leads (no quotation) deduct stock here on installation.
        const hasQuotation = await Quotation.exists({ leadId: body.leadId });
        if (!hasQuotation) {
            await adjustProductStocks(body.materials, -1);
        }
        // Keep the lead's Project Progress in sync — auto-create the record
        // (if missing) with the installation's material cost as the actual cost.
        await syncProjectProgressFromInstallation(installation);
        const initialChanges = Object.entries(installation.toObject())
            .filter(([k, v]) => v !== undefined && v !== null && v !== "" && !["_id", "__v", "createdAt", "updatedAt"].includes(k))
            .map(([k, v]) => ({ field: k, oldValue: null, newValue: v }));
        await logActivity({ req, module: "installations", action: "created", recordId: installation._id, recordLabel: installation.installationId, summary: `Installation ${installation.installationId} created`, changes: initialChanges });
        res.locals.activityLogged = true;
        res.locals.changes = initialChanges;
        return res.status(HTTP_STATUS.CREATED).json({
            success: true,
            message: "Installation created successfully",
            data: stripFileData(installation)
        });
    } catch (error) {
        console.error("Create Installation Error:", error);
        await deleteCloudinaryFiles(photoFiles);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getAllInstallations = async (req, res) => {
    try {
        const { search, status, verification, technician, startDate, endDate, sortField, sortDir, page = 1, limit = 10 } = req.query;
        const filter = {};
        applyCustomerScope(filter, req);
        if (status && status !== "All") filter.installationStatus = status;
        if (verification && verification !== "All") filter.verificationStatus = verification;
        if (technician && technician !== "All") filter.technicianName = technician;
        if (startDate || endDate) {
            filter.installationDate = {};
            if (startDate) {
                filter.installationDate.$gte = new Date(startDate);
            }
            if (endDate) {
                filter.installationDate.$lte = new Date(endDate);
            }
        }
        // Technicians only see installations assigned to them.
        if (req.user?.role === "technician") {
            if (req.user?.name) filter.technicianName = req.user.name;
            else filter._id = { $exists: false };
        } else if (req.user?.role === "sales_manager") {
            // Sales people only ever see installations for their OWN leads.
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        if (search) {
            filter.$or = [
                { installationId: { $regex: search, $options: "i" } },
                { customerName: { $regex: search, $options: "i" } },
                { leadId: { $regex: search, $options: "i" } },
                { technicianName: { $regex: search, $options: "i" } },
                { installationAddress: { $regex: search, $options: "i" } }
            ];
        }
        const sortableFields = ["createdAt", "installationId", "customerName", "leadId", "installationDate", "installationStatus", "technicianName", "verificationStatus"];
        const sortObj = {};
        // Default to createdAt descending so the newest installations appear on top.
        const sortKey = sortField && sortableFields.includes(sortField) ? sortField : "createdAt";
        sortObj[sortKey] = sortDir === "desc" || !sortField ? -1 : 1;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
        const skip = (pageNum - 1) * limitNum;
        const total = await Installation.countDocuments(filter);
        const installations = await Installation.find(filter)
            .select("-sitePhotos.fileData")
            .sort(sortObj).skip(skip).limit(limitNum).lean();
        installations.forEach(stripFileData);
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: installations,
            pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        console.error("Get All Installations Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const getInstallationById = async (req, res) => {
    try {
        const installation = await Installation.findById(req.params.id)
            .select("-sitePhotos.fileData")
            .lean();
        if (!installation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        // Technicians may only view installations assigned to them; sales
        // people only installations for their own leads.
        if (req.user?.role === "technician") {
            if (!isDocOwnedByTechnician(installation, req.user?.name)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this installation does not belong to your account" });
            }
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            if (!isDocOwnedBySales(installation, scope)) {
                return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, message: "Access denied: this installation does not belong to your account" });
            }
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, data: stripFileData(installation) });
    } catch (error) {
        console.error("Get Installation By ID Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const updateInstallation = async (req, res) => {
    let newPhotos = [];
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid installation id"
            });
        }
        const { installationId, ...body } = req.body;
        // Read the existing document WITHOUT the heavy file bytes: for plain
        // field edits (photos untouched) that read alone used to download
        // megabytes from remote MongoDB on every save. Metadata (incl. size)
        // is enough for the keep-list and budget checks below.
        const existing = await Installation.findById(req.params.id).select("-sitePhotos.fileData");
        if (!existing) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });

        const updateChanges = computeChanges(existing, body);

        // Validate status transition if status is being changed
        if (body.status && body.status !== existing.status) {
            const transitionError = validateStatusTransition("installations", existing.status, body.status);
            if (transitionError) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: transitionError
                });
            }
        }

        // Enforce the approved-approval rule when the installation is moved to a
        // different lead (updates that keep the same lead pass through).
        const newLeadId = body.leadId || existing.leadId;
        if (newLeadId !== (existing.leadId || "")) {
            const approved = await ensureApprovedApproval(newLeadId);
            if (!approved) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: "A project approval (Approved) is required before creating an installation for this lead."
                });
            }
            // The new lead must not already have another installation.
            const dup = await Installation.findOne({ leadId: newLeadId, _id: { $ne: existing._id } }).lean();
            if (dup) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: `An installation (${dup.installationId}) already exists for this lead.`
                });
            }
            body.projectApprovalId = approved.approvalId;
        }

        const hasQuotation = body.materials !== undefined
            ? await Quotation.exists({ leadId: newLeadId })
            : false;

        let keptPhotos = [];
        let keepIndices = [];
        let photosProvided = false;
        let photosUnchanged = false;
        let removedPhotos = [];
        if (body.sitePhotosKeep !== undefined) {
            photosProvided = true;
            try {
                const parsed = JSON.parse(body.sitePhotosKeep);
                if (Array.isArray(parsed)) {
                    keepIndices = parsed
                        .map((i) => parseInt(i, 10))
                        .filter((i) => Number.isInteger(i) && i >= 0);
                }
            } catch {
                // malformed keep-list -> treat as "keep nothing"
            }
            const storedPhotos = Array.isArray(existing.sitePhotos) ? existing.sitePhotos : [];
            keptPhotos = keepIndices
                .map((i) => storedPhotos[i])
                .filter(Boolean);
            // When the keep-list re-selects every stored photo in its original
            // order and no new file is uploaded, the stored files are untouched
            // — skip rewriting them so saving photo-heavy records stays fast.
            photosUnchanged =
                (req.files?.sitePhotos || []).length === 0 &&
                keepIndices.length === storedPhotos.length &&
                keepIndices.every((idx, i) => idx === i);
        }
        newPhotos = await Promise.all((req.files?.sitePhotos || []).map(buildFileMeta));
        if (photosUnchanged) {
            delete body.sitePhotos;
        } else if (photosProvided || newPhotos.length > 0) {
            if (keptPhotos.length > 0) {
                const withBytes = await Installation.findById(req.params.id)
                    .select("sitePhotos.fileData")
                    .lean();
                const storedPhotos = Array.isArray(withBytes?.sitePhotos) ? withBytes.sitePhotos : [];
                keptPhotos = keepIndices.map((i) => storedPhotos[i]).filter(Boolean);
            }
            body.sitePhotos = [...keptPhotos, ...newPhotos];
            removedPhotos = (Array.isArray(existing.sitePhotos) ? existing.sitePhotos : [])
                .filter((p, i) => p && !keepIndices.includes(i));
        } else {
            delete body.sitePhotos;
        }
        delete body.sitePhotosKeep;

        const finalPhotos = body.sitePhotos !== undefined ? body.sitePhotos : existing.sitePhotos;
        if (countInstallationFileBytes(finalPhotos) > INSTALLATION_FILE_BUDGET) {
            await deleteCloudinaryFiles(newPhotos);
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Total file size for an installation must stay under 14MB"
            });
        }

        // Projection keeps the returned document free of file bytes — with
        // { new: true } the driver fetches the whole updated doc back from
        // remote MongoDB, and without this it would re-download megabytes on
        // every save even when photos were untouched.
        const installation = await Installation.findByIdAndUpdate(req.params.id, body, {
            new: true,
            runValidators: true,
            projection: "-sitePhotos.fileData"
        });
        if (!installation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        // Stock accounting: only reconcile stock for legacy leads without a
        // quotation. Quoted leads had their stock reserved at quotation time.
        if (body.materials !== undefined && !hasQuotation) {
            await adjustProductStocks(existing.materials, 1);
            await adjustProductStocks(body.materials, -1);
        }
        await deleteCloudinaryFiles(removedPhotos);
        // Push the updated material cost into the lead's Project Progress record.
        await syncProjectProgressFromInstallation(installation);
        await logActivity({ req, module: "installations", action: "updated", recordId: installation._id, recordLabel: installation.installationId, summary: "Installation updated successfully.", changes: updateChanges });
        res.locals.activityLogged = true;

        // [FLOW-04] Notify assigned technician when installation is assigned/updated
        const oldTechName = existing.technicianName || "";
        const newTechName = installation.technicianName || "";
        if (newTechName && newTechName !== oldTechName && newTechName !== "Unassigned") {
            const techUserId = await findUserIdByName(newTechName);
            if (techUserId) {
                sendNotification({
                    recipientId: techUserId,
                    recipientRole: "technician",
                    type: "installation_assigned",
                    title: `Installation Assigned: ${installation.installationId}`,
                    message: `You have been assigned to installation ${installation.installationId} for ${installation.customerName || "customer"}${installation.installationDate ? ` on ${new Date(installation.installationDate).toLocaleDateString("en-IN")}` : ""}.`,
                    link: `/admin/installations`,
                    sourceModule: "installations",
                    sourceId: String(installation._id),
                    triggeredBy: req.user?.name || "System",
                }).catch(() => {});
            }
        }

        res.locals.changes = updateChanges;
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Installation updated successfully", data: stripFileData(installation) });
    } catch (error) {
        console.error("Update Installation Error:", error);
        await deleteCloudinaryFiles(newPhotos);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

export const downloadSitePhoto = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid installation id"
            });
        }
        const installation = await Installation.findById(req.params.id);
        if (!installation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        const index = parseInt(req.params.index, 10);
        if (isNaN(index) || !Array.isArray(installation.sitePhotos)) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Site photo not found" });
        }
        const photo = installation.sitePhotos[index];
        res.set("Cache-Control", "private, max-age=300");
        return await sendStoredFile(photo, res, "No file is stored for this installation");
    } catch (error) {
        console.error("Download Site Photo Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Quick inline status update from the table dropdown — only touches
// the installationStatus field without touching photos or other fields.
export const updateInstallationStatus = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "Invalid installation id"
            });
        }
        const { installationStatus } = req.body;
        const VALID = ["Pending", "Scheduled", "In Progress", "Completed", "On Hold"];
        if (!installationStatus || !VALID.includes(installationStatus)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: `Invalid status. Must be one of: ${VALID.join(", ")}`
            });
        }
        const installation = await Installation.findById(req.params.id);
        if (!installation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        }
        installation.installationStatus = installationStatus;
        await installation.save();
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: "Installation status updated successfully",
            data: stripFileData(installation.toObject())
        });
    } catch (error) {
        console.error("Update Installation Status Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};export const deleteInstallation = async (req, res) => {
    try {
        const force = req.query.force === "true";

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Invalid installation id" });
        }

        const installation = await Installation.findById(req.params.id);
        if (!installation) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });

        // [FLOW-06] Check for linked testing/commissioning records before deletion
        if (!force) {
            const check = await checkDependencies("installation", {
                installationId: installation.installationId,
                leadId: installation.leadId,
            });
            if (!check.canDelete) {
                return res.status(HTTP_STATUS.BAD_REQUEST).json({
                    success: false,
                    message: check.message,
                    dependencies: check.dependencies,
                });
            }
        }

        await Installation.findByIdAndDelete(req.params.id);
        await deleteCloudinaryFiles(installation.sitePhotos);

        const hasQuotation = await Quotation.findOne({ leadId: installation.leadId }).lean();
        if (!hasQuotation) {
            await adjustProductStocks(installation.materials, 1);
        }
        return res.status(HTTP_STATUS.OK).json({ success: true, message: "Installation deleted successfully" });
    } catch (error) {
        console.error("Delete Installation Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Aggregate stats for the dashboard cards: total installations split by the
// statuses the cards show, plus the lead IDs that already have an installation
// (so the form dropdown excludes them).
export const getInstallationStats = async (req, res) => {
    try {
        const filter = {};
        applyCustomerScope(filter, req);
        if (req.user?.role === "technician") {
            if (req.user?.name) filter.technicianName = req.user.name;
            else filter._id = { $exists: false };
        } else if (req.user?.role === "sales_manager") {
            const scope = await getSalesScope(req.user.name);
            mergeSalesOwnershipFilter(filter, scope);
        }
        const installations = await Installation.find(filter)
            .select("leadId installationStatus")
            .lean();
        const counts = { pending: 0, inProgress: 0, completed: 0 };
        for (const inst of installations) {
            if (inst.installationStatus === "Completed") counts.completed++;
            else if (inst.installationStatus === "In Progress") counts.inProgress++;
            else counts.pending++;
        }
        const installedLeadIds = [...new Set(installations.map((i) => i.leadId).filter(Boolean))];
        return res.status(HTTP_STATUS.OK).json({
            success: true,
            data: {
                total: installations.length,
                pending: counts.pending,
                inProgress: counts.inProgress,
                completed: counts.completed,
                installedLeadIds
            }
        });
    } catch (error) {
        console.error("Get Installation Stats Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

// Generate the next sequential quotation ID like Q-001, Q-002, ...
const generateQuotationId = async () => {
    const lastDoc = await Quotation.findOne({ quotationId: { $exists: true, $ne: null } })
        .sort({ _id: -1 })
        .select("quotationId")
        .lean();
    let max = 0;
    if (lastDoc && lastDoc.quotationId) {
        const m = lastDoc.quotationId.match(/(\d+)$/);
        if (m) max = parseInt(m[1], 10);
    }
    return `Q-${String(max + 1).padStart(3, "0")}`;
};

const GST_RATE = 0.18;

/**
 * POST /api/installations/:id/material-request
 * Submit a material request as a quotation for customer approval.
 * Creates a Quotation (type: "Material Request") linked to the installation.
 */
export const submitMaterialRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const { productName, category, brand, quantity, reason } = req.body;

        if (!productName || !productName.trim()) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Product name is required" });
        }
        if (!quantity || Number(quantity) < 1) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "Quantity must be at least 1" });
        }

        const installation = await Installation.findById(id).lean();
        if (!installation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        }

        // Find the product in catalog to get the price
        let price = 0;
        let resolvedProductId = "";

        if (req.body.productId) {
            const product = await resolveProductRefs([req.body.productId]).then((map) => {
                for (const [, p] of map) { if (p) return p; }
                return null;
            });
            if (product) {
                price = product.price || 0;
                resolvedProductId = String(product._id);
            }
        }

        if (!resolvedProductId) {
            const product = await resolveProductRefs([productName.trim()]).then((map) => {
                for (const [, p] of map) {
                    if (p && p.name && p.name.toLowerCase() === productName.trim().toLowerCase()) return p;
                }
                for (const [, p] of map) {
                    if (p && p.name && p.name.toLowerCase().includes(productName.trim().toLowerCase())) return p;
                }
                return null;
            });
            if (product) {
                price = product.price || 0;
                resolvedProductId = String(product._id);
            }
        }

        const qty = Math.floor(Number(quantity));
        const itemTotal = Math.round(price * qty);
        const itemGst = Math.round(itemTotal * GST_RATE);
        const itemGrandTotal = itemTotal + itemGst;

        // Find the EXISTING quotation for this installation's lead
        let quotation = null;
        if (installation.leadId) {
            quotation = await Quotation.findOne({ leadId: installation.leadId })
                .sort({ createdAt: -1 }).lean();
        }

        // If no quotation exists by leadId, try by client name
        if (!quotation && installation.customerName) {
            quotation = await Quotation.findOne({ client: installation.customerName })
                .sort({ createdAt: -1 }).lean();
        }

        if (!quotation) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No existing quotation found for this customer. Please create a quotation first."
            });
        }

        // Add the material request as a requestedItem in the existing quotation
        const requestedItem = {
            productName: productName.trim(),
            category: (category || "").trim(),
            brand: (brand || "").trim(),
            qty,
            price,
            label: productName.trim(),
            status: "Pending"
        };

        // Update the quotation: add requestedItem + recalculate totals
        const newTotal = (quotation.total || 0) + itemTotal;
        const newGst = (quotation.gst || 0) + itemGst;
        const newGrandTotal = (quotation.grandTotal || 0) + itemGrandTotal;

        await Quotation.findByIdAndUpdate(quotation._id, {
            $push: { requestedItems: requestedItem },
            $set: { total: newTotal, gst: newGst, grandTotal: newGrandTotal, status: "Sent", validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), installationId: id },
            $inc: { version: 1 }
        });

        // Save the material request into the installation
        const quotationId = quotation.quotationId || `Q-${quotation._id.toString().substring(quotation._id.toString().length - 4).toUpperCase()}`;
        const newRequest = {
            productName: productName.trim(),
            category: (category || "").trim(),
            brand: (brand || "").trim(),
            quantity: qty,
            reason: (reason || "").trim(),
            status: "Pending",
            quotationId,
            quotationMongoId: quotation._id.toString(),
            price
        };

        await Installation.findByIdAndUpdate(id, {
            $push: { materialRequests: newRequest }
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Material request added to quotation ${quotationId}. Customer can review and approve.`,
            data: { quotationId, quotationMongoId: quotation._id, price, status: "Pending" }
        });
    } catch (error) {
        console.error("Submit Material Request Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};

/**
 * POST /api/installations/:id/send-remaining-products
 * Sends a quotation to the customer with the remaining (unused) products
 * from the installation. Creates a Quotation (type: "Remaining Products")
 * so the customer can review and create a bill.
 */
export const sendRemainingProducts = async (req, res) => {
    try {
        const { id } = req.params;

        const installation = await Installation.findById(id).lean();
        if (!installation) {
            return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: "Installation not found" });
        }

        const materials = installation.materials || [];
        // Calculate remaining products (quotedQty - quantity used > 0)
        const remainingItems = [];
        for (const mat of materials) {
            const quotedQty = Number(mat.quotedQty || 0);
            const usedQty = Number(mat.quantity || 0);
            const remaining = quotedQty - usedQty;
            if (remaining > 0 && mat.productName) {
                remainingItems.push({
                    productName: mat.productName,
                    productId: mat.productId || "",
                    category: mat.category || "",
                    brand: mat.brand || "",
                    price: Number(mat.price || 0),
                    remainingQty: remaining
                });
            }
        }

        if (remainingItems.length === 0) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No remaining products found. All materials have been fully used."
            });
        }

        // Build the quotation items map
        const itemsMap = new Map();
        let total = 0;
        for (const item of remainingItems) {
            const key = item.productId || item.productName;
            itemsMap.set(key, {
                qty: item.remainingQty,
                price: item.price,
                label: item.productName
            });
            total += item.remainingQty * item.price;
        }

        total = Math.round(total);
        const gst = Math.round(total * GST_RATE);
        const grandTotal = total + gst;

        // Find the EXISTING quotation for this installation's lead
        let quotation = null;
        if (installation.leadId) {
            quotation = await Quotation.findOne({ leadId: installation.leadId })
                .sort({ createdAt: -1 }).lean();
        }
        if (!quotation && installation.customerName) {
            quotation = await Quotation.findOne({ client: installation.customerName })
                .sort({ createdAt: -1 }).lean();
        }

        if (!quotation) {
            return res.status(HTTP_STATUS.BAD_REQUEST).json({
                success: false,
                message: "No existing quotation found for this customer. Please create a quotation first."
            });
        }

        // Add remaining products as requestedItems in the existing quotation
        const requestedItems = remainingItems.map(item => ({
            productName: item.productName,
            category: item.category || "",
            brand: item.brand || "",
            qty: item.remainingQty,
            price: item.price,
            label: item.productName,
            status: "Pending"
        }));

        // Update quotation: add requestedItems, bump version, recalculate totals
        const newTotal = (quotation.total || 0) + total;
        const newGst = (quotation.gst || 0) + gst;
        const newGrandTotal = (quotation.grandTotal || 0) + grandTotal;

        await Quotation.findByIdAndUpdate(quotation._id, {
            $push: { requestedItems: { $each: requestedItems } },
            $set: {
                total: newTotal,
                gst: newGst,
                grandTotal: newGrandTotal,
                status: "Sent",
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                installationId: id
            },
            $inc: { version: 1 }
        });

        const quotationId = quotation.quotationId || `Q-${quotation._id.toString().substring(quotation._id.toString().length - 4).toUpperCase()}`;

        // Mark the installation that remaining products have been sent
        await Installation.findByIdAndUpdate(id, {
            remainingProductsQuotationId: quotationId
        });

        return res.status(HTTP_STATUS.OK).json({
            success: true,
            message: `Remaining products added to quotation ${quotationId} (v${(quotation.version || 1) + 1}). Customer can review.`,
            data: {
                quotationId,
                total,
                gst,
                grandTotal,
                itemCount: remainingItems.length,
                items: remainingItems
            }
        });
    } catch (error) {
        console.error("Send Remaining Products Error:", error);
        return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: MESSAGE.INTERNAL_SERVER_ERROR });
    }
};


