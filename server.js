const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Kết nối tự động nhận từ biến môi trường DATABASE_URL trên Render (đã ép IPv4)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Bắt buộc khi kết nối Supabase từ bên ngoài
    },
    family: 4 // Ép buộc sử dụng IPv4 để tránh lỗi ENETUNREACH trên Render
});

pool.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối Database:', err.stack);
    } else {
        console.log('Đã kết nối thành công với Supabase!');
    }
});

// Khởi tạo các bảng dữ liệu nếu chưa tồn tại
const initDatabase = async () => {
    try {
        await pool.query(`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT DEFAULT 'staff'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS settings (
            id SERIAL PRIMARY KEY,
            name TEXT,
            logo TEXT,
            address TEXT,
            phone TEXT,
            qr_code TEXT,
            banners TEXT,
            promo_text TEXT,
            promo_discount REAL DEFAULT 0
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS rooms (
            id SERIAL PRIMARY KEY,
            room_name TEXT,
            price_per_hour REAL,
            status TEXT DEFAULT 'Trống',
            booking_type TEXT,
            customer_name TEXT,
            customer_phone TEXT,
            customer_cccd TEXT,
            start_time TIMESTAMP,
            booked_slots TEXT DEFAULT '[]'
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS menu (
            id SERIAL PRIMARY KEY,
            item_name TEXT,
            category TEXT,
            unit TEXT,
            import_price REAL DEFAULT 0,
            price REAL
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS orders (
            id SERIAL PRIMARY KEY,
            room_id INTEGER,
            item_id INTEGER,
            quantity INTEGER,
            total_price REAL
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            item_name TEXT,
            category TEXT,
            quantity INTEGER,
            unit TEXT,
            import_price REAL,
            import_date TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS bills (
            id SERIAL PRIMARY KEY,
            room_name TEXT,
            hours REAL,
            room_total REAL,
            service_total REAL,
            grand_total REAL,
            total_import_cost REAL,
            items_detail TEXT,
            created_date TEXT
        )`);

        await pool.query(`CREATE TABLE IF NOT EXISTS expenses (
            id SERIAL PRIMARY KEY,
            category TEXT,
            amount REAL,
            note TEXT,
            date TEXT
        )`);

        // Thêm dữ liệu mặc định nếu bảng users trống
        const userCountRes = await pool.query(`SELECT COUNT(*) as count FROM users`);
        if (userCountRes.rows[0] && parseInt(userCountRes.rows[0].count) === 0) {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            await pool.query(`INSERT INTO users (username, password, role) VALUES ('nhanvien', '123456', 'staff')`);
            await pool.query(`INSERT INTO settings (name, logo, address, phone, qr_code, banners, promo_text, promo_discount) VALUES ('Karaoke KALI', '', '123 Đường Karaoke, Cà Mau', '0909123456', 'https://api.vietqr.io/image/970422-123456789-n5398FP.jpg', '["https://images.unsplash.com/photo-1516450360452-9312f5e86fc7"]', 'Giảm giá 10% giờ hát cho mọi khách hàng!', 10)`);
            await pool.query(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng 1', 150000, 'Trống')`);
            await pool.query(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng 2', 150000, 'Trống')`);
            await pool.query(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng Vip 2', 300000, 'Trống')`);
        }
        console.log('Khởi tạo cấu trúc CSDL hoàn tất.');
    } catch (err) {
        console.error('Lỗi khởi tạo CSDL:', err);
    }
};

initDatabase();

// --- API Users ---
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM users WHERE username = $1 AND password = $2`, [username, password]);
        const row = result.rows[0];
        if (!row) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
        res.json({ success: true, user: { username: row.username, role: row.role } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/users', async (req, res) => {
    try {
        const result = await pool.query(`SELECT id, username, role FROM users`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/users/save', async (req, res) => {
    const { id, username, password, role } = req.body;
    try {
        if (id) {
            if (password) {
                await pool.query(`UPDATE users SET username = $1, password = $2, role = $3 WHERE id = $4`, [username, password, role, id]);
            } else {
                await pool.query(`UPDATE users SET username = $1, role = $2 WHERE id = $3`, [username, role, id]);
            }
        } else {
            await pool.query(`INSERT INTO users (username, password, role) VALUES ($1, $2, $3)`, [username, password || '123456', role || 'staff']);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Tên tài khoản đã tồn tại hoặc có lỗi xảy ra!' });
    }
});

app.delete('/api/users/:id', async (req, res) => {
    try {
        const userRes = await pool.query(`SELECT username FROM users WHERE id = $1`, [req.params.id]);
        const row = userRes.rows[0];
        if (row && row.username === 'admin') return res.status(400).json({ error: 'Không thể xóa tài khoản admin gốc!' });
        
        await pool.query(`DELETE FROM users WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Settings ---
app.get('/api/settings', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM settings LIMIT 1`);
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/settings', async (req, res) => {
    const { name, logo, address, phone, qr_code, banners, promo_text, promo_discount } = req.body;
    try {
        await pool.query(`UPDATE settings SET name = $1, logo = $2, address = $3, phone = $4, qr_code = $5, banners = $6, promo_text = $7, promo_discount = $8 WHERE id = 1`, 
            [name, logo, address, phone, qr_code, JSON.stringify(banners || []), promo_text || '', promo_discount || 0]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Rooms ---
app.get('/api/rooms', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM rooms`);
        const now = new Date();
        const updatedRows = (result.rows || []).map(r => {
            if (r.start_time) {
                const start = new Date(r.start_time);
                r.hours_booked = Math.max(0.1, ((now - start) / (1000 * 60 * 60))).toFixed(1);
            } else {
                r.hours_booked = 0;
            }
            try { r.booked_slots_arr = JSON.parse(r.booked_slots || '[]'); } catch(e) { r.booked_slots_arr = []; }
            return r;
        });
        res.json(updatedRows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rooms/save', async (req, res) => {
    const { id, room_name, price_per_hour } = req.body;
    try {
        if (id) {
            await pool.query(`UPDATE rooms SET room_name = $1, price_per_hour = $2 WHERE id = $3`, [room_name, price_per_hour, id]);
        } else {
            await pool.query(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ($1, $2, 'Trống')`, [room_name, price_per_hour]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/rooms/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM rooms WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rooms/book', async (req, res) => {
    const { room_id, booking_type, customer_name, customer_phone, selected_slots, start_time_custom } = req.body;
    try {
        if (booking_type === 'counter') {
            const start_time = new Date().toISOString();
            await pool.query(`UPDATE rooms SET status = 'Đang hát', booking_type = 'counter', customer_name = $1, customer_phone = $2, start_time = $3 WHERE id = $4`,
                [customer_name || 'Khách tại quầy', customer_phone || '', start_time, room_id]);
            res.json({ success: true });
        } else {
            const roomRes = await pool.query(`SELECT booked_slots FROM rooms WHERE id = $1`, [room_id]);
            const row = roomRes.rows[0];
            let existingSlots = [];
            try { existingSlots = JSON.parse(row?.booked_slots || '[]'); } catch(e) {}
            
            const newSlots = Array.isArray(selected_slots) ? selected_slots : [selected_slots];
            const mergedSlots = Array.from(new Set([...existingSlots, ...newSlots])).sort();
            const firstSlotTime = start_time_custom || (mergedSlots.length > 0 ? mergedSlots[0] : new Date().toISOString());

            await pool.query(`UPDATE rooms SET status = 'Đang hát', booking_type = 'online', customer_name = $1, customer_phone = $2, booked_slots = $3, start_time = $4 WHERE id = $5`, 
                [customer_name || 'Khách online', customer_phone || '', JSON.stringify(mergedSlots), firstSlotTime, room_id]);
            res.json({ success: true });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rooms/cancel-booking', async (req, res) => {
    const { room_id } = req.body;
    try {
        await pool.query(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, start_time = NULL, booked_slots = '[]' WHERE id = $1`, [room_id]);
        res.json({ success: true, message: 'Đã hủy giờ đặt phòng thành công!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rooms/checkout', async (req, res) => {
    const { room_id } = req.body;
    try {
        const settingRes = await pool.query(`SELECT * FROM settings LIMIT 1`);
        const setting = settingRes.rows[0];

        const roomRes = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [room_id]);
        const room = roomRes.rows[0];

        if (!room || room.status === 'Trống') return res.status(400).json({ error: 'Phòng đang trống!' });

        const startTime = room.start_time ? new Date(room.start_time) : new Date();
        const now = new Date();
        const hours = Math.max(0.2, (now - startTime) / (1000 * 60 * 60));
        const roomTotal = hours * room.price_per_hour;

        const orderRes = await pool.query(`SELECT o.*, m.item_name, m.category, m.unit, m.import_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [room_id]);
        const orderItems = orderRes.rows || [];

        const foodItems = orderItems.filter(i => i.category === 'food');
        const drinkItems = orderItems.filter(i => i.category === 'drink');
        const otherItems = orderItems.filter(i => i.category === 'khác');

        const serviceTotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
        const subTotal = roomTotal + serviceTotal;
        
        const discountPercent = Number(setting?.promo_discount || 0);
        const discountAmount = (subTotal * discountPercent) / 100;
        const grandTotal = subTotal - discountAmount;

        const totalImportCost = orderItems.reduce((sum, item) => sum + (item.import_price * item.quantity), 0);
        const currentDate = new Date().toISOString().split('T')[0];

        await pool.query(`INSERT INTO bills (room_name, hours, room_total, service_total, grand_total, total_import_cost, items_detail, created_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [room.room_name, hours.toFixed(2), roomTotal, serviceTotal, grandTotal, totalImportCost, JSON.stringify(orderItems), currentDate]);
        
        for (const item of orderItems) {
            await pool.query(`UPDATE inventory SET quantity = GREATEST(0, quantity - $1) WHERE item_name = $2`, [item.quantity, item.item_name]);
        }

        await pool.query(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, start_time = NULL, booked_slots = '[]' WHERE id = $1`, [room_id]);
        await pool.query(`DELETE FROM orders WHERE room_id = $1`, [room_id]);

        res.json({
            success: true,
            setting: setting || {},
            report: {
                room_name: room.room_name,
                hours: hours.toFixed(2),
                price_per_hour: room.price_per_hour,
                roomTotal: roomTotal.toFixed(0),
                foodItems,
                drinkItems,
                otherItems,
                serviceTotal: serviceTotal.toFixed(0),
                subTotal: subTotal.toFixed(0),
                discountPercent,
                discountAmount: discountAmount.toFixed(0),
                grandTotal: grandTotal.toFixed(0)
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Reports & Details ---
app.get('/api/reports/revenue', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let billQuery = `SELECT SUM(grand_total) as totalRevenue FROM bills`;
        let expQuery = `SELECT category, SUM(amount) as totalExp FROM expenses`;
        let params = [];

        if (start_date && end_date) {
            billQuery += ` WHERE created_date BETWEEN $1 AND $2`;
            expQuery += ` WHERE date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }
        expQuery += ` GROUP BY category`;

        const billRes = await pool.query(billQuery, params);
        const invRes = await pool.query(`SELECT SUM(quantity * import_price) as totalInventoryValue FROM inventory`);
        const expRes = await pool.query(expQuery, params);

        const totalRevenue = billRes.rows[0]?.totalrevenue || 0;
        const totalImport = invRes.rows[0]?.totalinventoryvalue || 0;
        const grossProfit = totalRevenue - totalImport;

        let expenses = {
            'Lương': 0, 'Điện': 0, 'Nước': 0, 'Trang trí': 0,
            'Thiết bị': 0, 'Mặt bằng': 0, 'Khác': 0
        };
        let totalExpense = 0;
        (expRes.rows || []).forEach(e => {
            expenses[e.category] = Number(e.totalexp) || 0;
            totalExpense += Number(e.totalexp) || 0;
        });

        const netProfit = grossProfit - totalExpense;
        res.json({ totalRevenue, totalImport, grossProfit, expenses, totalExpense, netProfit });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/reports/bills-detail', async (req, res) => {
    const { start_date, end_date } = req.query;
    try {
        let query = `SELECT * FROM bills`;
        let params = [];
        if (start_date && end_date) {
            query += ` WHERE created_date BETWEEN $1 AND $2`;
            params = [start_date, end_date];
        }
        query += ` ORDER BY id DESC`;
        const result = await pool.query(query, params);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Menu ---
app.get('/api/menu', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM menu`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/menu/save', async (req, res) => {
    const { id, item_name, category, unit, import_price, price } = req.body;
    try {
        if(id) {
            await pool.query(`UPDATE menu SET item_name = $1, category = $2, unit = $3, import_price = $4, price = $5 WHERE id = $6`, 
                [item_name, category, unit, import_price || 0, price, id]);
        } else {
            await pool.query(`INSERT INTO menu (item_name, category, unit, import_price, price) VALUES ($1, $2, $3, $4, $5)`, 
                [item_name, category, unit, import_price || 0, price]);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/menu/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM menu WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/orders/:room_id', async (req, res) => {
    try {
        const result = await pool.query(`SELECT o.id, m.item_name, m.category, m.unit, o.quantity, o.total_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = $1`, [req.params.room_id]);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    try {
        const itemRes = await pool.query(`SELECT price FROM menu WHERE id = $1`, [item_id]);
        const item = itemRes.rows[0];
        if (!item) return res.status(400).json({ error: 'Món không tồn tại' });
        
        const total_price = item.price * quantity;
        await pool.query(`INSERT INTO orders (room_id, item_id, quantity, total_price) VALUES ($1, $2, $3, $4)`, [room_id, item_id, quantity, total_price]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Inventory ---
app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM inventory`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/inventory/save', async (req, res) => {
    const { id, item_name, category, quantity, unit, import_price } = req.body;
    const currentDate = new Date().toISOString().split('T')[0];
    try {
        if (id) {
            await pool.query(`UPDATE inventory SET item_name = $1, category = $2, quantity = $3, unit = $4, import_price = $5 WHERE id = $6`,
                [item_name, category, quantity, unit, import_price, id]);
        } else {
            await pool.query(`INSERT INTO inventory (item_name, category, quantity, unit, import_price, import_date) VALUES ($1, $2, $3, $4, $5, $6)`, 
                [item_name, category, quantity, unit, import_price, currentDate]);
            
            const menuRes = await pool.query(`SELECT * FROM menu WHERE item_name = $1`, [item_name]);
            if (menuRes.rows.length === 0) {
                const sellPrice = import_price * 1.3;
                await pool.query(`INSERT INTO menu (item_name, category, unit, import_price, price) VALUES ($1, $2, $3, $4, $5)`, 
                    [item_name, category, unit, import_price, sellPrice]);
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/inventory/:id', async (req, res) => {
    try {
        await pool.query(`DELETE FROM inventory WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- API Expenses ---
app.get('/api/expenses', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM expenses`);
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/expenses', async (req, res) => {
    const { category, amount, note, date } = req.body;
    const expenseDate = date || new Date().toISOString().split('T')[0];
    try {
        await pool.query(`INSERT INTO expenses (category, amount, note, date) VALUES ($1, $2, $3, $4)`, [category, amount, note, expenseDate]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
