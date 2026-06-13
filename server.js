/**
 * @file server.js
 * @description Archivo principal del servidor backend de La Esquina App. Configura Express, Socket.io, Prisma, autenticación JWT y rutas.
 */

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

// Validación de entorno (Fail Fast) para asegurar que existe la clave secreta
if (!process.env.JWT_SECRET) throw new Error("FATAL ERROR: JWT_SECRET no configurado.");

/**
 * Cliente de Prisma para interactuar con la base de datos.
 * @type {PrismaClient}
 */
const prisma = new PrismaClient();

/**
 * Instancia de la aplicación Express.
 */
const app = express();

/**
 * Servidor HTTP de Node.js.
 */
const server = http.createServer(app);

// ==========================================
// 1. MIDDLEWARES DE INFRAESTRUCTURA
// ==========================================
// Configurar proxy seguro si se está detrás de un balanceador de carga
app.set('trust proxy', 1);

// Seguridad para los headers HTTP
app.use(helmet());

// Compresión de respuestas HTTP para mejorar el rendimiento
app.use(compression());

// Loggea todas las peticiones en consola
app.use(morgan('dev')); 

/**
 * Opciones de configuración para el middleware CORS.
 * Define qué orígenes están permitidos para hacer peticiones al servidor.
 * @type {Object}
 */
const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://la-esquina-app.onrender.com',
        'https://laesquinadelbillar.vercel.app',
        'http://laesquinadelbillar.com',
        'https://laesquinadelbillar.com',
        'https://www.laesquinadelbillar.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// Parseo de bodies en formato JSON
app.use(express.json());

// Parseo de datos url-encoded
app.use(express.urlencoded({ extended: true }));

// Parseo de cookies
app.use(cookieParser());

/**
 * Middleware para limitar la tasa de peticiones (Rate Limiting).
 * Protege contra ataques DDoS y de fuerza bruta.
 * @type {import('express').RequestHandler}
 */
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100, // 100 peticiones por minuto por IP
    message: { success: false, error: 'Demasiadas peticiones desde esta IP, por favor intente de nuevo en un minuto.' }
});

// Aplicar el límite a todas las rutas bajo /api
app.use('/api', limiter);

/**
 * Instancia de WebSockets.
 * @type {Server}
 */
const io = new Server(server, { cors: corsOptions });

// Almacenar la instancia de Socket.io en app para usarla en controladores
app.set('socketio', io);

// ==========================================
// 2. MIDDLEWARES DE SEGURIDAD
// ==========================================

/**
 * Middleware Anti-CSRF
 * Protege endpoints mutables (POST, PUT, DELETE) contra Cross-Site Request Forgery
 * verificando que el Origin de la petición sea parte de los permitidos en CORS.
 */
const antiCsrf = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin || req.headers.referer;
    if (!origin) return res.status(403).json({ error: "Petición bloqueada: Falta cabecera Origin (Posible CSRF)" });
    
    const isValidOrigin = corsOptions.origin.some(allowed => origin.startsWith(allowed));
    if (!isValidOrigin) {
        return res.status(403).json({ error: "Petición bloqueada: Origen no permitido (Posible CSRF)" });
    }
    next();
};

app.use(antiCsrf);

const { verificarSesion } = require('./middlewares/auth.middleware');

/**
 * Límite específico para peticiones de inicio de sesión para prevenir fuerza bruta.
 * @type {import('express').RequestHandler}
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: "Demasiados intentos. Intente más tarde." }
});

// ==========================================
// 3. RUTAS CORE (AUTH & PÚBLICO)
// ==========================================

/**
 * @route GET /api/health
 * @description Ruta de control de salud para servicios de monitoreo o cron jobs.
 */
app.get('/api/health', (req, res) => {
    console.log("[CRON] Ping recibido para mantener el servidor despierto.");
    res.status(200).send('OK');
});

// ==========================================
// 3. API DE AUTENTICACIÓN (LOGIN & JWT)
// ==========================================

/**
 * @route POST /api/login
 * @description Iniciar sesión del usuario, generar un token JWT y asignarlo como cookie.
 * @param {express.Request} req - Petición HTTP.
 * @param {express.Response} res - Respuesta HTTP.
 * @param {express.NextFunction} next - Función para pasar el control al manejador de errores.
 */
app.post('/api/login', loginLimiter, async (req, res, next) => {
    try {
        // 1. LOG: Qué está llegando al servidor
        console.log("[LOGIN] Petición recibida:", req.body);

        // Validación de datos de entrada usando Zod
        const { username, password } = z.object({ 
            username: z.string(), 
            password: z.string() 
        }).parse(req.body);

        // 2. LOG: Qué estamos buscando en la base de datos
        const user = await prisma.usuarios.findFirst({
            where: { username: username, estado: 'activo' }
        });
        
        // Si el usuario no existe o está inactivo, rechazar de inmediato
        if (!user) {
            console.log("[AUTH] Usuario no encontrado o inactivo:", username);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // 3. LOG: Usuario encontrado, ahora validamos contraseña
        console.log("[AUTH] Usuario encontrado:", user.username, "| Verificando contraseña...");

        let esValida = false;
        
        // Comprobar si la contraseña ya fue hasheada (empieza por $2 de bcrypt)
        if (user.password.startsWith('$2')) {
            esValida = await bcrypt.compare(password, user.password);
        } else {
            // Seguridad: Bloqueamos el login en texto plano heredado.
            // Los usuarios afectados deben restablecer la contraseña contactando a un admin.
            console.warn(`[AUTH ALERTA] Intento de login con contraseña no encriptada en base de datos para: ${username}`);
            return res.status(401).json({ error: 'Credenciales inválidas o cuenta que requiere actualización. Contacte a Soporte.' });
        }

        // 4. LOG: Resultado de la comparación
        console.log("[AUTH] Contraseña válida:", esValida);

        // Si la contraseña no es válida, devolvemos error
        if (!esValida) {
            console.log("[AUTH] Contraseña incorrecta para:", username);
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }

        // Firmar el token JWT con los datos del usuario
        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        // Enviar el token como cookie segura y HTTP-only
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', // true en Render
            sameSite: 'none',
            maxAge: 12 * 60 * 60 * 1000 // 12 horas
        });

        // Retornar éxito junto con el rol y el token
        res.json({ success: true, rol: user.rol, token: token });
    } catch (err) { 
        next(err); 
    }
});

/**
 * @route GET /api/usuario/actual
 * @description Obtiene los datos básicos del usuario actualmente logueado mediante el middleware de verificación de sesión.
 * @param {express.Request} req - Petición HTTP.
 * @param {express.Response} res - Respuesta HTTP.
 */
app.get('/api/usuario/actual', verificarSesion, (req, res) => {
    res.json({ username: req.usuario.username, rol: req.usuario.rol });
});

/**
 * @route POST /api/logout
 * @description Cierra la sesión eliminando la cookie del token JWT.
 * @param {express.Request} req - Petición HTTP.
 * @param {express.Response} res - Respuesta HTTP.
 */
app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none'
    });
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
app.use('/api', require('./routes/reportes.routes')); // NUEVA LÍNEA AÑADIDA
app.use('/api/notificaciones', require('./routes/notificaciones.routes')); // Campanita Global
app.use('/api/reclamaciones', require('./routes/reclamaciones.routes')); // Libro de Reclamaciones

// ==========================================
// 5. MANEJO DE ERRORES CENTRALIZADO
// ==========================================

/**
 * Global Error Handler para capturar errores de toda la app y evitar fuga de información sensible.
 * @param {Error} err - Objeto de error capturado.
 * @param {express.Request} req - Petición HTTP.
 * @param {express.Response} res - Respuesta HTTP.
 * @param {express.NextFunction} next - Función next.
 */
app.use((err, req, res, next) => {
    console.error('[Error Crítico Servidor]', err);
    
    // Si es un error de validación de Zod, responder con los detalles
    if (err.name === 'ZodError' || (typeof z !== 'undefined' && err instanceof z.ZodError)) {
        return res.status(400).json({ success: false, error: "Datos inválidos", detalles: err.errors });
    }
    
    // Cualquier otro error interno
    res.status(500).json({ success: false, error: 'Ocurrió un error interno en el servidor.' });
});

// ==========================================
// 6. ARRANQUE
// ==========================================

/**
 * Puerto en el cual el servidor escuchará peticiones.
 * @type {number|string}
 */
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`[SERVER] La Esquina - Servidor online en puerto ${PORT}`);
    // Conectar a la base de datos al arrancar el servidor
    prisma.$connect().then(() => console.log("[DB] Base de datos conectada."));
});