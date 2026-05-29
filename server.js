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
const morgan = require('morgan');
const { PrismaClient } = require('@prisma/client');

// Validación de entorno (Fail Fast)
if (!process.env.JWT_SECRET) throw new Error("FATAL ERROR: JWT_SECRET no configurado.");

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);

// ==========================================
// 1. MIDDLEWARES DE INFRAESTRUCTURA
// ==========================================
app.set('trust proxy', 1);
app.use(helmet());
app.use(compression());
app.use(morgan('dev')); // Loggea todas las peticiones en consola

const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://la-esquina-app.onrender.com',
        'https://laesquinadelbillar.vercel.app'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// WebSockets
const io = new Server(server, { cors: corsOptions });
app.set('socketio', io);

// ==========================================
// 2. MIDDLEWARES DE SEGURIDAD
// ==========================================
const { verificarSesion } = require('./middlewares/auth.middleware');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Demasiados intentos. Intente más tarde." }
});

// ==========================================
// 3. RUTAS CORE (AUTH & PÚBLICO)
// ==========================================
// ==========================================
// 3. API DE AUTENTICACIÓN (LOGIN & JWT)
// ==========================================
app.post('/api/login', loginLimiter, async (req, res, next) => {
    try {
        // 1. LOG: Qué está llegando al servidor
        console.log("[LOGIN] Petición recibida:", req.body);

        const { username, password } = z.object({ 
            username: z.string(), 
            password: z.string() 
        }).parse(req.body);

        // 2. LOG: Qué estamos buscando
        const user = await prisma.usuarios.findFirst({
            where: { username: username, estado: 'activo' }
        });
        
        if (!user) {
            console.log("[AUTH] Usuario no encontrado o inactivo:", username);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // 3. LOG: Usuario encontrado, ahora validamos contraseña
        console.log("[AUTH] Usuario encontrado:", user.username, "| Verificando contraseña...");

        let esValida = false;
        if (user.password.startsWith('$2')) {
            esValida = await bcrypt.compare(password, user.password);
        } else {
            esValida = user.password === password;
            if (esValida) {
                const hash = await bcrypt.hash(password, 10);
                await prisma.usuarios.update({ where: { id: user.id }, data: { password: hash } });
            }
        }

        // 4. LOG: Resultado de la comparación
        console.log("[AUTH] Contraseña válida:", esValida);

        if (!esValida) {
            console.log("[AUTH] Contraseña incorrecta para:", username);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', 
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/'             // 🔥 VITAL: Esto asegura que la cookie aplique a toda la web
});

        res.json({ success: true, rol: user.rol });
    } catch (e) { 
        next(e); 
    }
});
app.get('/api/usuario/actual', verificarSesion, (req, res) => {
    res.json({ username: req.usuario.username, rol: req.usuario.rol });
});

app.get('/api/logout', (req, res) => {
    res.clearCookie('token');
    res.json({ success: true });
});

// ==========================================
// 4. RUTAS DE NEGOCIO (Modular)
// ==========================================
app.use('/api', require('./routes/inventario.routes'));
app.use('/api/mesas', require('./routes/mesas.routes'));
app.use('/api/auditoria', require('./routes/auditoria.routes'));
app.use('/api', require('./routes/vip.routes'));
app.use('/api', require('./routes/pedidos.routes'));
app.use('/api', require('./routes/caja.routes'));
app.use('/api', require('./routes/eventos.routes'));
app.use('/api/usuarios', require('./routes/usuarios.routes'));

// ==========================================
// 5. MANEJO DE ERRORES CENTRALIZADO
// ==========================================
app.use((err, req, res, next) => {
    console.error("[ERROR]", err);
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Datos inválidos", detalles: err.errors });
    res.status(500).json({ error: "Ocurrió un error en el servidor." });
});

// ==========================================
// 6. ARRANQUE
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[SERVER] La Esquina - Servidor online en puerto ${PORT}`);
    prisma.$connect().then(() => console.log("[DB] Base de datos conectada."));
});