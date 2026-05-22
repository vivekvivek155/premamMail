const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dns = require('dns');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env') });
const { Resend } = require('resend');

const app = express();
app.use(express.json());
app.use(cors());

const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM_EMAIL || 'Secret Letter App <premam@premam.yandu.in>';
const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:5500').replace(/\/$/, '');

if (!resendApiKey) {
    console.error("❌ Missing RESEND_API_KEY in backend/.env");
    process.exit(1);
}

const resend = new Resend(resendApiKey);

// Connect to MongoDB Atlas
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
    console.error("❌ Missing MONGO_URI in backend/.env");
    process.exit(1);
}

if (mongoURI.startsWith('mongodb+srv://')) {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
}

mongoose.connect(mongoURI)
    .then(() => console.log("MongoDB connected successfully!"))
    .catch(err => {
        console.error("MongoDB connection error:", err);
        process.exit(1);
    });

// Define the Letter Blueprint (Schema)
const letterSchema = new mongoose.Schema({
    customId: { type: String, required: true, unique: true },
    senderEmail: { type: String, required: true },
    receiverEmail: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, default: "unread" } 
});

const Letter = mongoose.model('Letter', letterSchema);

// Helper to generate a random 7-character ID
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 9);
}

// ── ROUTE 1: Save Letter & Send Email ───────────────────────────────────────
app.post('/api/letters', async (req, res) => {
    try {
        const { senderEmail, receiverEmail, message, frontendUrl: clientFrontendUrl } = req.body;
        const customId = generateUniqueId();

        if (!senderEmail || !receiverEmail || !message) {
            return res.status(400).json({ success: false, error: 'senderEmail, receiverEmail, and message are required.' });
        }

        // Save letter to the database
        const newLetter = new Letter({
            customId,
            senderEmail,
            receiverEmail,
            message
        });
        await newLetter.save();

        // Determine the best frontend URL. Prefer the client-provided origin when available.
        const clientUrl = typeof clientFrontendUrl === 'string' && clientFrontendUrl.trim() !== ''
            ? clientFrontendUrl.replace(/\/$/, '')
            : null;
        const effectiveFrontendUrl = clientUrl || frontendUrl;
        const magicLink = `${effectiveFrontendUrl}/index.html?id=${customId}`;

        const emailPayload = {
            from: resendFrom,
            to: receiverEmail,
            cc: senderEmail,
            reply_to: senderEmail,
            subject: `A secret message from ${senderEmail}`,
            text: `Open this link to read your secret letter: ${magicLink}`,
            html: `
                <div style="font-family: sans-serif; text-align: center; padding: 24px;">
                    <h2 style="font-size: 22px; margin-bottom: 10px; color: #d81b60;">You have a secret letter!</h2>
                    <p style="font-size: 16px; color: #333; margin-bottom: 20px;">Click the link below to view your message.</p>
                    <a href="${magicLink}" style="display: inline-block; padding: 14px 26px; background-color: #e91e63; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">Open your letter</a>
                    <p style="margin-top: 20px; font-size: 13px; color: #555;">This secret letter can only be opened once.</p>
                </div>
            `
        };

        console.log('Sending email payload:', {
            to: receiverEmail,
            cc: senderEmail,
            from: resendFrom,
            subject: emailPayload.subject,
            link: magicLink
        });

        await resend.emails.send(emailPayload);

        res.status(201).json({ success: true, customId, link: magicLink });
    } catch (error) {
        console.error('Server/Email Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── ROUTE 2: Fetch a letter by ID ───────────────────────────────────────────
app.get('/api/letters/:id', async (req, res) => {
    try {
        const letter = await Letter.findOne({ customId: req.params.id });
        
        if (!letter) {
            return res.status(404).json({ success: false, message: "Letter not found." });
        }

        if (letter.status === 'torn') {
            return res.json({ success: true, status: 'torn', message: null });
        }

        res.json({ success: true, status: letter.status, message: letter.message });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ── ROUTE 3: Mark letter as torn ────────────────────────────────────────────
app.post('/api/letters/:id/tear', async (req, res) => {
    try {
        const letter = await Letter.findOneAndUpdate(
            { customId: req.params.id },
            { status: 'torn' },
            { new: true }
        );

        if (!letter) {
            return res.status(404).json({ success: false, message: "Letter not found." });
        }

        res.json({ success: true, message: "Letter destroyed permanently." });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));