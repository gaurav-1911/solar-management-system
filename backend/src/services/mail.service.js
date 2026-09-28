import nodemailer from "nodemailer";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

// Load Environment Variables
dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: Number(process.env.EMAIL_PORT) === 465,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

// SMTP Verification
transporter.verify((error) => {
    if (error) {
        logger.warn("SMTP Connection Failed:", error.message);
    } else {
        logger.info("SMTP Server Connected Successfully");
    }
});

const sendEmail = async (
    to,
    subject,
    options
) => {
    try {
        const info = await transporter.sendMail({
            from: `"Solar Management System" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html: options.html,
            text: options.text,
            attachments:
                options.attachments || []
        });

        logger.info(`Email sent successfully: ${info.messageId}`);

        return info;

    } catch (error) {
        logger.error(`Email sending failed: ${error.message}`);

        throw error;
    }
};

export default sendEmail;