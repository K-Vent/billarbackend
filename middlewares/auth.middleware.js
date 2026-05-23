const jwt = require('jsonwebtoken');

// Módulo de Entorno de Seguridad
const SECRET_KEY = process.env.JWT_SECRET;

// ==========================================
// MIDDLEWARES DE SEGURIDAD Y ACCESO (IAM)
// ==========================================

/**
 * Guardia de Sesión (Capa 1: Autenticación)
 * Verifica la validez criptográfica del JWT almacenado en las cookies.
 * Maneja el enrutamiento inteligente dependiendo del tipo de cliente (API vs Navegador).
 * * @param {Object} req - Petición HTTP
 * @param {Object} res - Respuesta HTTP
 * @param {Function} next - Función para ceder el control al siguiente middleware
 */
const verificarSesion = (req, res, next) => {
    // Uso de optional chaining (?.) para evitar caídas si req.cookies no está definido
    const token = req.cookies?.token; 
    
    if (!token) {
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Acceso denegado: Credenciales no proporcionadas.' });
        }
        return res.redirect('/'); 
    }
    
    try {
        // Desencriptación y validación del token
        const decodificado = jwt.verify(token, SECRET_KEY);
        req.usuario = decodificado; // Inyectamos { id, username, rol } al ciclo de vida de la petición
        
        next(); 
    } catch (error) {
        // Si el token fue alterado, expiró o está corrupto, limpiamos la sesión
        res.clearCookie('token');
        
        // Registro silencioso en servidor para auditoría técnica
        console.error(`🛡️ [AUTH FALLIDO] Token rechazado en la ruta ${req.originalUrl}: ${error.message}`);

        if (req.originalUrl.startsWith('/api/')) {
            return res.status(401).json({ error: 'Sesión expirada o token de seguridad inválido.' });
        }
        return res.redirect('/');
    }
};

/**
 * Guardia de Gerencia (Capa 2: Autorización)
 * Restringe rutas críticas exclusivamente al rol de administrador.
 * Depende de que 'verificarSesion' haya inyectado req.usuario previamente.
 */
const soloAdmin = (req, res, next) => {
    if (req.usuario && req.usuario.rol === 'admin') {
        next(); // Es jefe, tiene luz verde
    } else {
        const infractor = req.usuario ? req.usuario.username : 'Desconocido';
        
        // Alerta visible en la consola del servidor para monitoreo en tiempo real
        console.warn(`🚨 [SEGURIDAD] Intento de vulneración de privilegios: El usuario '${infractor}' intentó acceder a ${req.originalUrl}`);
        
        if (req.originalUrl.startsWith('/api/')) {
            return res.status(403).json({ error: 'Acceso denegado: Área exclusiva de Gerencia.' });
        }
        
        // Redirección táctica a un área segura para el empleado
        res.redirect('/dashboard.html'); 
    }
};

module.exports = { 
    verificarSesion, 
    soloAdmin 
};