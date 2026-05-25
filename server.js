/* ============================================================
   SERVER.JS - API CORE "LA ESQUINA DEL BILLAR"
   Arquitectura: Prisma ORM / JWT / WebSockets / Zod
   ============================================================ */

require('dotenv').config();
const express = require('express');
const http = require('http'); 
const { Server } = require('socket.io'); 
const cors = require('cors'); 
const helmet = require('helmet'); 
const rateLimit = require('express-rate-limit'); 
const compression = require('compression'); 
const bcrypt = require('bcrypt'); 
const { z } = require('zod'); 
const jwt = require('jsonwebtoken'); 
const cookieParser = require('cookie-parser');

// 🔥 ORM Moderno: Reemplaza a './db.js'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middlewares de Seguridad IAM
const { verificarSesion, soloAdmin } = require('./middlewares/auth.middleware');

const app = express(); 
const server = http.createServer(app); 

// ==========================================
// 1. CONFIGURACIÓN CORS Y WEBSOCKETS (REACT-READY)
// ==========================================
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true, 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
};

const io = new Server(server, { cors: corsOptions }); 
app.set('socketio', io);

// Seguridad y Optimización de red
app.set('trust proxy', 1);
app.use(helmet()); 
app.use(compression()); 
app.use(cors({
    origin: 'http://localhost:5173',
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Llave maestra criptográfica
const SECRET_KEY = process.env.JWT_SECRET || 'llave_maestra_billar_2026';

// Monitor de conexiones en tiempo real
io.on('connection', (socket) => { 
    console.log('📱 Dispositivo KDS/POS conectado:', socket.id); 
});

// ==========================================
// 2. INICIALIZACIÓN DE CONEXIÓN ORM
// ==========================================
// Toda la lógica de "CREATE TABLE" se eliminó. Prisma gestiona la estructura externamente.
prisma.$connect()
    .then(() => console.log("✅ Conexión establecida con el clúster de base de datos."))
    .catch((e) => console.error("❌ Fallo crítico en la conexión con la base de datos:", e));

// ==========================================
// 3. API DE AUTENTICACIÓN (LOGIN & JWT)
// ==========================================
const loginSchema = z.object({ 
    username: z.string().min(1), 
    password: z.string().min(1) 
});

const loginLimiter = rateLimit({ 
    windowMs: 15 * 60 * 1000, 
    max: 10, 
    message: { error: "⛔ Demasiados intentos de acceso fallidos. Por seguridad, intente más tarde." } 
});

app.post(['/login', '/api/login'], loginLimiter, async (req, res, next) => {
    try { 
        const { username, password } = loginSchema.parse(req.body); 
        
        // Prisma: Búsqueda del usuario activo
        const user = await prisma.usuarios.findFirst({
            where: { username: username, estado: 'activo' }
        });
        
        if (user) { 
            let passwordCorrecta = false; 
            
            // Lógica de migración transparente de contraseñas legacy a Bcrypt
            if (user.password.startsWith('$2')) { 
                passwordCorrecta = await bcrypt.compare(password, user.password); 
            } else { 
                // Si la contraseña estaba en texto plano (sistemas antiguos), la encriptamos al vuelo
                if (user.password === password) { 
                    passwordCorrecta = true; 
                    const hashedPassword = await bcrypt.hash(password, 10); 
                    await prisma.usuarios.update({
                        where: { id: user.id },
                        data: { password: hashedPassword }
                    }); 
                } 
            } 
            
            if (passwordCorrecta) { 
                const token = jwt.sign(
                    { id: user.id, username: user.username, rol: user.rol }, 
                    SECRET_KEY, 
                    { expiresIn: '12h' }
                );

                res.cookie('token', token, { 
                    httpOnly: true, 
                    secure: process.env.NODE_ENV === 'production', 
                    sameSite: 'lax', 
                    maxAge: 12 * 60 * 60 * 1000 
                });

                return res.json({ success: true, rol: user.rol }); 
            } 
        } 
        res.status(401).json({ success: false, error: 'Credenciales incorrectas' }); 
    } catch (e) { next(e); } 
});

app.get('/api/logout', (req, res) => { 
    res.clearCookie('token'); 
    res.json({ success: true }); 
});

app.get('/api/usuario/actual', verificarSesion, (req, res) => { 
    res.json({ username: req.usuario.username, rol: req.usuario.rol || 'mozo' }); 
});

// ==========================================
// 4. API PÚBLICA (CARTA DIGITAL)
// ==========================================
app.get('/api/menu/publico', async (req, res, next) => { 
    try { 
        // Prisma: Extraemos el menú filtrando stock, seleccionando columnas y ordenando
        const menu = await prisma.productos.findMany({
            where: {
                stock: { gt: 0 },
                estado: 'activo'
            },
            select: {
                nombre: true,
                precio_venta: true,
                categoria: true
            },
            orderBy: [
                { categoria: 'asc' },
                { nombre: 'asc' }
            ]
        });
        
        res.json(menu); 
    } catch (e) { next(e); } 
});

// ==========================================
// 5. ENRUTADOR MODULAR (MÓDULOS DE NEGOCIO)
// ==========================================
app.use('/api/usuarios', require('./routes/usuarios.routes'));
app.use('/api/productos', require('./routes/inventario.routes'));
app.use('/api/mesas', require('./routes/mesas.routes'));
app.use('/api/auditoria', require('./routes/auditoria.routes'));
app.use('/api', require('./routes/vip.routes')); 
app.use('/api', require('./routes/reportes.routes'));
app.use('/api', require('./routes/pedidos.routes'));
app.use('/api', require('./routes/caja.routes'));
app.use('/api', require('./routes/eventos.routes'));

// ==========================================
// 6. GESTOR CENTRAL DE ERRORES (AOP)
// ==========================================
app.use((err, req, res, next) => {
    console.error("🔥 Error del Servidor:", err.message || err);
    
    // Captura de errores de validación de Zod
    if (err instanceof z.ZodError) { 
        return res.status(400).json({ 
            error: "Datos de entrada inválidos.", 
            detalles: err.errors.map(e => `${e.path.join('.')}: ${e.message}`) 
        }); 
    }
    
    // Captura de errores del motor de Prisma (Ej: P2002 Unique Constraint)
    if (err.code && err.code.startsWith('P')) { 
        return res.status(500).json({ error: "Conflicto interno de operaciones de base de datos." }); 
    }
    
    res.status(500).json({ error: "Ocurrió un error interno en el servidor." });
});

// ==========================================
// 7. ARRANQUE DEL SERVIDOR
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎱 Motor Core "La Esquina" [ONLINE] - Puerto ${PORT}`);
});

// Manejo elegante de apagado del servidor
process.on('SIGINT', async () => {
    await prisma.$disconnect();
    console.log('🛑 Conexión a base de datos cerrada de forma segura.');
    process.exit(0);
});