import Department from "../models/department.model.js";

const defaultDepartments = [
  { name: "Administration", code: "admin", head: "Super Admin", description: "Executive leadership and admin operations" },
  { name: "Sales", code: "sales", head: "Amit Sharma", description: "Sales, lead conversion and client acquisition" },
  { name: "Technical & Field", code: "technical", head: "Ravi Patel", description: "Field surveys, solar design and installation execution" },
  { name: "Finance & Accounts", code: "finance", head: "Priya Mehta", description: "Invoicing, payments, tax and subsidy management" },
  { name: "Support & Service", code: "support", head: "Neha Kapoor", description: "Customer support, ticketing and AMC service" },
  { name: "Human Resources", code: "hr", head: "Pooja Reddy", description: "Recruitment, payroll and staff management" },
  { name: "Inventory & Procurement", code: "inventory", head: "Vikram Singh", description: "Stock control, equipment purchasing and logistics" },
  { name: "Project Management", code: "projects", head: "Arun Nair", description: "Project planning, approvals and timeline tracking" },
];

export const seedDepartments = async () => {
  try {
    for (const d of defaultDepartments) {
      const existing = await Department.findOne({ name: d.name });
      if (!existing) {
        await Department.create(d);
        console.log(`✅ Seeded department '${d.name}'`);
      }
    }
    console.log("Departments are up to date in MongoDB");
  } catch (error) {
    console.error("❌ Department Seeder Error:", error.message);
  }
};

export default seedDepartments;
