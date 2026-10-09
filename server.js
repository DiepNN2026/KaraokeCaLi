const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Cố định đường dẫn tuyệt đối cho file database.db để tránh bị thất lạc file khi thay đổi thư mục chạy
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Lỗi kết nối cơ sở dữ liệu:', err.message);
    } else {
        console.log(`Đã kết nối cơ sở dữ liệu SQLite tại: ${dbPath}`);
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'staff'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        logo TEXT,
        address TEXT,
        phone TEXT,
        qr_code TEXT,
        banners TEXT,
        promo_text TEXT,
        promo_discount REAL DEFAULT 0
    )`, () => {
        db.run(`ALTER TABLE settings ADD COLUMN promo_text TEXT`, () => {});
        db.run(`ALTER TABLE settings ADD COLUMN promo_discount REAL DEFAULT 0`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_name TEXT,
        price_per_hour REAL,
        status TEXT DEFAULT 'Trống',
        booking_type TEXT,
        customer_name TEXT,
        customer_phone TEXT,
        customer_cccd TEXT,
        start_time DATETIME,
        booked_slots TEXT DEFAULT '[]'
    )`, () => {
        db.run(`ALTER TABLE rooms ADD COLUMN booking_type TEXT`, () => {});
        db.run(`ALTER TABLE rooms ADD COLUMN customer_name TEXT`, () => {});
        db.run(`ALTER TABLE rooms ADD COLUMN customer_phone TEXT`, () => {});
        db.run(`ALTER TABLE rooms ADD COLUMN customer_cccd TEXT`, () => {});
        db.run(`ALTER TABLE rooms ADD COLUMN start_time DATETIME`, () => {});
        db.run(`ALTER TABLE rooms ADD COLUMN booked_slots TEXT DEFAULT '[]'`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS menu (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT,
        category TEXT,
        unit TEXT,
        import_price REAL DEFAULT 0,
        price REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_id INTEGER,
        item_id INTEGER,
        quantity INTEGER,
        total_price REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name TEXT,
        category TEXT,
        quantity INTEGER,
        unit TEXT,
        import_price REAL,
        import_date TEXT
    )`, () => {
        db.run(`ALTER TABLE inventory ADD COLUMN import_date TEXT`, () => {});
    });

    db.run(`CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_name TEXT,
        hours REAL,
        room_total REAL,
        service_total REAL,
        grand_total REAL,
        total_import_cost REAL,
        items_detail TEXT,
        created_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        amount REAL,
        note TEXT,
        date TEXT
    )`, () => {
        db.run(`ALTER TABLE expenses ADD COLUMN date TEXT`, () => {});
    });

    db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO users (username, password, role) VALUES ('admin', '123456', 'admin')`);
            db.run(`INSERT INTO users (username, password, role) VALUES ('nhanvien', '123456', 'staff')`);
            db.run(`INSERT INTO settings (name, logo, address, phone, qr_code, banners, promo_text, promo_discount) VALUES ('Karaoke KALI', '', '123 Đường Karaoke, Cà Mau', '0909123456', 'https://api.vietqr.io/image/970422-123456789-n5398FP.jpg', '["https://images.unsplash.com/photo-1516450360452-9312f5e86fc7"]', 'Giảm giá 10% giờ hát cho mọi khách hàng!', 10)`);
            db.run(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng 1', 150000, 'Trống')`);
            db.run(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng 2', 150000, 'Trống')`);
            db.run(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES ('Phòng Vip 2', 300000, 'Trống')`);
        }
    });
});

// --- API Users ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (!row) return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu!' });
        res.json({ success: true, user: { username: row.username, role: row.role } });
    });
});

app.get('/api/users', (req, res) => {
    db.all(`SELECT id, username, role FROM users`, (err, rows) => res.json(rows || []));
});

app.post('/api/users/save', (req, res) => {
    const { id, username, password, role } = req.body;
    if (id) {
        if (password) {
            db.run(`UPDATE users SET username = ?, password = ?, role = ? WHERE id = ?`, [username, password, role, id], (err) => {
                if (err) return res.status(400).json({ error: 'Tên tài khoản đã tồn tại!' });
                res.json({ success: true });
            });
        } else {
            db.run(`UPDATE users SET username = ?, role = ? WHERE id = ?`, [username, role, id], (err) => {
                if (err) return res.status(400).json({ error: 'Tên tài khoản đã tồn tại!' });
                res.json({ success: true });
            });
        }
    } else {
        db.run(`INSERT INTO users (username, password, role) VALUES (?, ?, ?)`, [username, password || '123456', role || 'staff'], (err) => {
            if (err) return res.status(400).json({ error: 'Tài khoản đã tồn tại!' });
            res.json({ success: true });
        });
    }
});

app.delete('/api/users/:id', (req, res) => {
    db.get(`SELECT username FROM users WHERE id = ?`, [req.params.id], (err, row) => {
        if (row && row.username === 'admin') return res.status(400).json({ error: 'Không thể xóa tài khoản admin gốc!' });
        db.run(`DELETE FROM users WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
    });
});

// --- API Settings ---
app.get('/api/settings', (req, res) => {
    db.get(`SELECT * FROM settings LIMIT 1`, (err, row) => res.json(row || {}));
});

app.post('/api/settings', (req, res) => {
    const { name, logo, address, phone, qr_code, banners, promo_text, promo_discount } = req.body;
    db.run(`UPDATE settings SET name = ?, logo = ?, address = ?, phone = ?, qr_code = ?, banners = ?, promo_text = ?, promo_discount = ? WHERE id = 1`, 
        [name, logo, address, phone, qr_code, JSON.stringify(banners || []), promo_text || '', promo_discount || 0], () => {
        res.json({ success: true });
    });
});

// --- API Rooms ---
app.get('/api/rooms', (req, res) => {
    db.all(`SELECT * FROM rooms`, (err, rows) => {
        const now = new Date();
        const updatedRows = (rows || []).map(r => {
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
    });
});

app.post('/api/rooms/save', (req, res) => {
    const { id, room_name, price_per_hour } = req.body;
    if (id) {
        db.run(`UPDATE rooms SET room_name = ?, price_per_hour = ? WHERE id = ?`, [room_name, price_per_hour, id], () => res.json({ success: true }));
    } else {
        db.run(`INSERT INTO rooms (room_name, price_per_hour, status) VALUES (?, ?, 'Trống')`, [room_name, price_per_hour], () => res.json({ success: true }));
    }
});

app.delete('/api/rooms/:id', (req, res) => {
    db.run(`DELETE FROM rooms WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

app.post('/api/rooms/book', (req, res) => {
    const { room_id, booking_type, customer_name, customer_phone, selected_slots, start_time_custom } = req.body;
    
    if (booking_type === 'counter') {
        const start_time = new Date().toISOString();
        db.run(`UPDATE rooms SET status = 'Đang hát', booking_type = 'counter', customer_name = ?, customer_phone = ?, start_time = ? WHERE id = ?`,
            [customer_name || 'Khách tại quầy', customer_phone || '', start_time, room_id], (err) => {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ success: true });
            });
    } else {
        db.get(`SELECT booked_slots FROM rooms WHERE id = ?`, [room_id], (err, row) => {
            let existingSlots = [];
            try { existingSlots = JSON.parse(row?.booked_slots || '[]'); } catch(e) {}
            
            const newSlots = Array.isArray(selected_slots) ? selected_slots : [selected_slots];
            const mergedSlots = Array.from(new Set([...existingSlots, ...newSlots])).sort();
            const firstSlotTime = start_time_custom || (mergedSlots.length > 0 ? mergedSlots[0] : new Date().toISOString());

            db.run(`UPDATE rooms SET status = 'Đang hát', booking_type = 'online', customer_name = ?, customer_phone = ?, booked_slots = ?, start_time = ? WHERE id = ?`, 
                [customer_name || 'Khách online', customer_phone || '', JSON.stringify(mergedSlots), firstSlotTime, room_id], (err) => {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true });
                });
        });
    }
});

app.post('/api/rooms/cancel-booking', (req, res) => {
    const { room_id } = req.body;
    db.run(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, start_time = NULL, booked_slots = '[]' WHERE id = ?`, [room_id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Đã hủy giờ đặt phòng thành công!' });
    });
});

app.post('/api/rooms/checkout', (req, res) => {
    const { room_id } = req.body;
    db.get(`SELECT * FROM settings LIMIT 1`, (err, setting) => {
        db.get(`SELECT * FROM rooms WHERE id = ?`, [room_id], (err, room) => {
            if (!room || room.status === 'Trống') return res.status(400).json({ error: 'Phòng đang trống!' });

            const startTime = room.start_time ? new Date(room.start_time) : new Date();
            const now = new Date();
            const hours = Math.max(0.2, (now - startTime) / (1000 * 60 * 60));
            const roomTotal = hours * room.price_per_hour;

            db.all(`SELECT o.*, m.item_name, m.category, m.unit, m.import_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = ?`, [room_id], (err, orderItems) => {
                const items = orderItems || [];
                const foodItems = items.filter(i => i.category === 'food');
                const drinkItems = items.filter(i => i.category === 'drink');
                const otherItems = items.filter(i => i.category === 'khác');

                const serviceTotal = items.reduce((sum, item) => sum + item.total_price, 0);
                const subTotal = roomTotal + serviceTotal;
                
                const discountPercent = Number(setting?.promo_discount || 0);
                const discountAmount = (subTotal * discountPercent) / 100;
                const grandTotal = subTotal - discountAmount;

                const totalImportCost = items.reduce((sum, item) => sum + (item.import_price * item.quantity), 0);
                const currentDate = new Date().toISOString().split('T')[0];

                db.run(`INSERT INTO bills (room_name, hours, room_total, service_total, grand_total, total_import_cost, items_detail, created_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [room.room_name, hours.toFixed(2), roomTotal, serviceTotal, grandTotal, totalImportCost, JSON.stringify(items), currentDate], () => {
                    
                    items.forEach(item => {
                        db.run(`UPDATE inventory SET quantity = MAX(0, quantity - ?) WHERE item_name = ?`, [item.quantity, item.item_name]);
                    });

                    db.run(`UPDATE rooms SET status = 'Trống', booking_type = NULL, customer_name = NULL, customer_phone = NULL, customer_cccd = NULL, start_time = NULL, booked_slots = '[]' WHERE id = ?`, [room_id], () => {
                        db.run(`DELETE FROM orders WHERE room_id = ?`, [room_id], () => {
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
                        });
                    });
                });
            });
        });
    });
});

// --- API Reports & Details ---
app.get('/api/reports/revenue', (req, res) => {
    const { start_date, end_date } = req.query;
    let billQuery = `SELECT SUM(grand_total) as totalRevenue FROM bills`;
    let expQuery = `SELECT category, SUM(amount) as totalExp FROM expenses`;
    let params = [];

    if (start_date && end_date) {
        billQuery += ` WHERE created_date BETWEEN ? AND ?`;
        expQuery += ` WHERE date BETWEEN ? AND ?`;
        params = [start_date, end_date];
    }
    expQuery += ` GROUP BY category`;

    db.get(billQuery, params, (err, billRow) => {
        db.all(`SELECT SUM(quantity * import_price) as totalInventoryValue FROM inventory`, (err, invRow) => {
            db.all(expQuery, params, (err, expRows) => {
                const totalRevenue = billRow?.totalRevenue || 0;
                const totalImport = invRow?.[0]?.totalInventoryValue || 0;
                const grossProfit = totalRevenue - totalImport;

                let expenses = {
                    'Lương': 0, 'Điện': 0, 'Nước': 0, 'Trang trí': 0,
                    'Thiết bị': 0, 'Mặt bằng': 0, 'Khác': 0
                };
                let totalExpense = 0;
                (expRows || []).forEach(e => {
                    expenses[e.category] = e.totalExp || 0;
                    totalExpense += e.totalExp || 0;
                });

                const netProfit = grossProfit - totalExpense;
                res.json({ totalRevenue, totalImport, grossProfit, expenses, totalExpense, netProfit });
            });
        });
    });
});

app.get('/api/reports/bills-detail', (req, res) => {
    const { start_date, end_date } = req.query;
    let query = `SELECT * FROM bills`;
    let params = [];
    if (start_date && end_date) {
        query += ` WHERE created_date BETWEEN ? AND ?`;
        params = [start_date, end_date];
    }
    query += ` ORDER BY id DESC`;
    db.all(query, params, (err, rows) => {
        res.json(rows || []);
    });
});

// --- API Menu ---
app.get('/api/menu', (req, res) => {
    db.all(`SELECT * FROM menu`, (err, rows) => res.json(rows || []));
});

app.post('/api/menu/save', (req, res) => {
    const { id, item_name, category, unit, import_price, price } = req.body;
    if(id) {
        db.run(`UPDATE menu SET item_name = ?, category = ?, unit = ?, import_price = ?, price = ? WHERE id = ?`, 
            [item_name, category, unit, import_price || 0, price, id], () => res.json({ success: true }));
    } else {
        db.run(`INSERT INTO menu (item_name, category, unit, import_price, price) VALUES (?, ?, ?, ?, ?)`, 
            [item_name, category, unit, import_price || 0, price], () => res.json({ success: true }));
    }
});

app.delete('/api/menu/:id', (req, res) => {
    db.run(`DELETE FROM menu WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

app.get('/api/orders/:room_id', (req, res) => {
    db.all(`SELECT o.id, m.item_name, m.category, m.unit, o.quantity, o.total_price FROM orders o JOIN menu m ON o.item_id = m.id WHERE o.room_id = ?`, [req.params.room_id], (err, rows) => res.json(rows || []));
});

app.post('/api/orders', (req, res) => {
    const { room_id, item_id, quantity } = req.body;
    db.get(`SELECT price FROM menu WHERE id = ?`, [item_id], (err, item) => {
        if (!item) return res.status(400).json({ error: 'Món không tồn tại' });
        const total_price = item.price * quantity;
        db.run(`INSERT INTO orders (room_id, item_id, quantity, total_price) VALUES (?, ?, ?, ?)`, [room_id, item_id, quantity, total_price], () => res.json({ success: true }));
    });
});

// --- API Inventory ---
app.get('/api/inventory', (req, res) => {
    db.all(`SELECT * FROM inventory`, (err, rows) => res.json(rows || []));
});

app.post('/api/inventory/save', (req, res) => {
    const { id, item_name, category, quantity, unit, import_price } = req.body;
    const currentDate = new Date().toISOString().split('T')[0];
    if (id) {
        db.run(`UPDATE inventory SET item_name = ?, category = ?, quantity = ?, unit = ?, import_price = ? WHERE id = ?`,
            [item_name, category, quantity, unit, import_price, id], () => {
                res.json({ success: true });
            });
    } else {
        db.run(`INSERT INTO inventory (item_name, category, quantity, unit, import_price, import_date) VALUES (?, ?, ?, ?, ?, ?)`, 
            [item_name, category, quantity, unit, import_price, currentDate], () => {
            db.get(`SELECT * FROM menu WHERE item_name = ?`, [item_name], (err, row) => {
                const sellPrice = import_price * 1.3;
                if (!row) {
                    db.run(`INSERT INTO menu (item_name, category, unit, import_price, price) VALUES (?, ?, ?, ?, ?)`, 
                        [item_name, category, unit, import_price, sellPrice]);
                }
            });
            res.json({ success: true });
        });
    }
});

app.delete('/api/inventory/:id', (req, res) => {
    db.run(`DELETE FROM inventory WHERE id = ?`, [req.params.id], () => res.json({ success: true }));
});

// --- API Expenses ---
app.get('/api/expenses', (req, res) => {
    db.all(`SELECT * FROM expenses`, (err, rows) => res.json(rows || []));
});

app.post('/api/expenses', (req, res) => {
    const { category, amount, note, date } = req.body;
    const expenseDate = date || new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO expenses (category, amount, note, date) VALUES (?, ?, ?, ?)`, [category, amount, note, expenseDate], () => res.json({ success: true }));
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại http://localhost:${PORT}`);
});