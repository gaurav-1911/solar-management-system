import cloudinary from "cloudinary";

// Configure once from environment variables (set in .env).
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadBuffer = (buffer, options) =>
    new Promise((resolve, reject) => {
        const stream = cloudinary.v2.uploader.upload_stream(options, (error, result) =>
            error ? reject(error) : resolve(result)
        );
        stream.end(buffer);
    });

const resourceTypeForMime = (mimeType) => {
    if (mimeType && mimeType.startsWith("image/")) return "image";
    if (mimeType && mimeType.startsWith("video/")) return "video";
    return "raw";
};

export const uploadFileToCloudinary = async (file, folder) => {
    if (!file || !file.buffer) return null;
    const result = await uploadBuffer(file.buffer, {
        folder,
        resource_type: resourceTypeForMime(file.mimetype),
        unique_filename: true,
        overwrite: false
    });
    return {
        name: file.originalname,
        originalName: file.originalname,
        mimeType: file.mimetype || "",
        size: file.size || file.buffer.length,
        hasFile: true,
        publicId: result.public_id,
        url: result.secure_url,
        resourceType: result.resource_type
    };
};

export const deleteCloudinaryFile = async (fileMeta) => {
    if (!fileMeta || !fileMeta.publicId) return;
    const types = fileMeta.resourceType
        ? [fileMeta.resourceType, "raw", "image", "video"]
        : ["raw", "image", "video"];
    for (const t of types) {
        try {
            const res = await cloudinary.v2.uploader.destroy(fileMeta.publicId, { resource_type: t });
            if (res && res.result !== "not found") return; // destroyed
        } catch {
            // try the next resource type
        }
    }
};

export const deleteCloudinaryFiles = async (files) => {
    for (const f of files || []) {
        await deleteCloudinaryFile(f);
    }
};
