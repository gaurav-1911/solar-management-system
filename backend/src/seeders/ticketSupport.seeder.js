import TicketSupport from "../models/ticketSupport.model.js";

const defaultTickets = [
    {
        subject: "Inverter not responding",
        description: "The solar grid inverter is showing a solid red status light and not producing any energy output since this morning.",
        customer: "Meera Iyer",
        email: "meera.iyer@example.com",
        phone: "9876543221",
        category: "Technical",
        priority: "High",
        status: "Open",
        assignedAgent: "Ravi Patel"
    },
    {
        subject: "Low energy output query",
        description: "The daily solar energy generation has dropped by 30% over the last week compared to normal baseline levels. No shading observed.",
        customer: "Arjun Nair",
        email: "arjun.nair@example.com",
        phone: "9876543222",
        category: "Technical",
        priority: "Medium",
        status: "In Progress",
        assignedAgent: "Ravi Patel"
    },
    {
        subject: "Panel cleaning request",
        description: "AMC customer requesting quarterly routine panel cleaning and general system health inspection for their 5kW rooftop installation.",
        customer: "Deepa Menon",
        email: "deepa.menon@example.com",
        phone: "9876543223",
        category: "General",
        priority: "Low",
        status: "Resolved",
        assignedAgent: "Unassigned"
    },
    {
        subject: "Billing discrepancy",
        description: "The recent installation invoice lists a different amount than what was agreed upon in the approved quotation document.",
        customer: "Sanjay Gupta",
        email: "sanjay.gupta@example.com",
        phone: "9876543224",
        category: "Billing",
        priority: "High",
        status: "Open",
        assignedAgent: "Priya Mehta"
    }
];

export const seedTicketSupport = async () => {
    try {
        const count = await TicketSupport.countDocuments();
        if (count === 0) {
            await TicketSupport.insertMany(defaultTickets);
            console.log(`✅ Seeded ${defaultTickets.length} default support tickets`);
        } else {
            console.log("Support tickets already exist in MongoDB");
        }
    } catch (error) {
        console.error("❌ Ticket Support Seeder Error:", error.message);
    }
};

export default seedTicketSupport;
