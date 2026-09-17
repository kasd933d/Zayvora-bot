require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mysql = require('mysql2/promise');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// 1. MySQL Pool Setup
const dbPool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10
});

// 2. Gemini AI Setup (Pakistan Market Focused)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-3.6-flash",
    systemInstruction: {
        parts: [{ 
            text: `You are the friendly customer support AI for ZAYVORA, a luxury kitchenware brand in Pakistan.
            - Payment Method: Cash on Delivery (COD) only.
            - Delivery Time: 2-3 working days across Pakistan.
            - Return Policy: 7-day easy replacement guarantee.
            - Always reply politely in simple Roman Urdu or English based on the user's input.
            - Keep answers short and concise (under 2-3 sentences).` 
        }]
    }
});
// 3. Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', (qr) => {
    console.log('\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP BUSINESS APP ---\n');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('🚀 ZAYVORA Bot Live & Ready for Pakistan Orders!');
});

// 4. Message Processing (Supports both direct messages and self-testing)
client.on('message_create', async (msg) => {
    // Self-loop prevention for bot's own replies
    if (msg.fromMe && msg.to !== msg.from) return;

    const text = msg.body;

    // A. Website Se Aaya Hua Direct Order
    if (text.includes('New Order') && text.includes('Customer Details:')) {
        try {
            const nameMatch = text.match(/Name:\s*(.+)/);
            const phoneMatch = text.match(/Phone:\s*(.+)/);
            const addressMatch = text.match(/Address:\s*(.+)/);
            const cityMatch = text.match(/City:\s*(.+)/);
            const postalMatch = text.match(/Postal Code:\s*(.+)/);
            const notesMatch = text.match(/Notes:\s*(.+)/);
            const itemsMatch = text.match(/Order Items:\n([\s\S]*?)\n\nOrder Summary:/);
            const totalMatch = text.match(/Total:\s*(.+)/);

            const name = nameMatch ? nameMatch[1].trim() : "Customer";
            const phone = phoneMatch ? phoneMatch[1].trim() : msg.from.replace('@c.us', '');
            const address = addressMatch ? addressMatch[1].trim() : "N/A";
            const city = cityMatch ? cityMatch[1].trim() : "N/A";
            const postalCode = postalMatch ? postalMatch[1].trim() : "N/A";
            const notes = notesMatch ? notesMatch[1].trim() : "N/A";
            const productDetails = itemsMatch ? itemsMatch[1].trim() : "ZAYVORA Kitchenware Item";
            const total = totalMatch ? totalMatch[1].trim() : "Rs. 2,499";

            // Save Order to MySQL
            const insertQuery = `
                INSERT INTO orders (customer_name, phone, address, city, postal_code, notes, product_details, total_price)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `;
            await dbPool.execute(insertQuery, [name, phone, address, city, postalCode, notes, productDetails, total]);

            // Direct Confirmation Reply
            const confirmReply = `Assalam-o-Alaikum ${name}! 👋\n\nShukriya! Aapka ZAYVORA order receive ho gaya hai. 📦\n\nHum 2-3 working days mein Cash on Delivery par dispatch kar rahe hain. Standard Shipping Free hai! ✨`;
            await msg.reply(confirmReply);
            console.log(`✅ Order auto-saved for: ${name} (${phone})`);

        } catch (err) {
            console.error("❌ Order Processing Error:", err);
            await msg.reply("Aapka order receive ho gaya hai! Hamari team jald aap se contact karegi.");
        }
    } 
    // B. Normal Customer Queries (Gemini AI Support)
    else {
        try {
            const result = await model.generateContent(`Customer asked: "${text}"`);
            const aiReply = result.response.text();
            await msg.reply(aiReply);
        } catch (err) {
            console.error("❌ Gemini API Error:", err);
        }
    }
});

client.initialize();