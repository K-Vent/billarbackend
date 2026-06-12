const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

// ==========================================
// CONTROLADOR DE EMPLEADOS (USUARIOS)
// ==========================================

/**
 * Obtiene la lista de todos los usuarios registrados en el sistema.
 * 
 * @param {Object} req - El objeto de la solicitud HTTP.
 * @param {Object} res - El objeto de la respuesta HTTP.
 * @param {Function} next - Función para pasar el control al siguiente middleware (manejo de errores).
 * @returns {Promise<void>} - Retorna una lista de usuarios en formato JSON.
 */
const obtenerUsuarios = async (req, res, next) => {
    try {
        // Realiza una consulta a la base de datos para obtener los usuarios, seleccionando solo campos específicos
        const usuarios = await prisma.usuarios.findMany({
            select: { id: true, username: true, rol: true, estado: true }
        });
        
        // Envía la lista de usuarios obtenida como respuesta
        res.json(usuarios);
    } catch (e) { 
        // Pasa cualquier error al middleware de manejo de errores
        next(e); 
    }
};

/**
 * Crea un nuevo usuario en el sistema.
 * 
 * @param {Object} req - El objeto de la solicitud HTTP. Contiene username, password y rol en el body.
 * @param {Object} res - El objeto de la respuesta HTTP.
 * @param {Function} next - Función para pasar el control al siguiente middleware.
 * @returns {Promise<Object>} - Retorna un JSON indicando el éxito de la operación o un error.
 */
const crearUsuario = async (req, res, next) => {
    try {
        // Extrae los datos del cuerpo de la solicitud
        const { username, password, rol } = req.body;
        
        // Verifica que los campos obligatorios hayan sido proporcionados
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        // Valida que la contraseña cumpla con la longitud mínima de seguridad
        if (password.length < 8) {
            return res.status(400).json({ error: 'Por seguridad, la contraseña debe tener al menos 8 caracteres.' });
        }

        // Comprueba si ya existe un usuario con el mismo nombre en la base de datos
        const existe = await prisma.usuarios.findUnique({ where: { username } });
        if (existe) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
        }

        // Genera un hash seguro para la contraseña usando bcrypt
        const hash = await bcrypt.hash(password, 10);
        
        // Crea el nuevo registro de usuario en la base de datos
        await prisma.usuarios.create({
            data: {
                username: username,
                password: hash,
                // Asigna el rol proporcionado o usa 'staff' como valor por defecto
                rol: rol || 'staff',
                // Define el estado inicial del usuario como 'activo'
                estado: 'activo'
            }
        });
        
        // Responde indicando que la creación fue exitosa
        res.json({ success: true });
    } catch (e) { 
        // Delega la excepción al manejador de errores
        next(e); 
    }
};

/**
 * Cambia el estado de un usuario (activo o inactivo).
 * 
 * @param {Object} req - El objeto de la solicitud HTTP. Contiene el ID del usuario en los parámetros y el nuevo estado en el body.
 * @param {Object} res - El objeto de la respuesta HTTP.
 * @param {Function} next - Función para pasar el control al siguiente middleware.
 * @returns {Promise<Object>} - Retorna un JSON indicando el éxito o un mensaje de error.
 */
const cambiarEstadoUsuario = async (req, res, next) => {
    try {
        // Convierte el ID del usuario recibido en los parámetros de la URL a un entero
        const id = parseInt(req.params.id);
        
        // Extrae el nuevo estado desde el cuerpo de la solicitud
        const { estado } = req.body; // 'activo' o 'inactivo'
        
        // Evita que un administrador se desactive a sí mismo accidentalmente
        if (id === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta activa.' });
        }

        // Actualiza el estado del usuario en la base de datos
        await prisma.usuarios.update({
            where: { id: id },
            data: { estado: estado }
        });
        
        // Responde con un indicador de éxito
        res.json({ success: true });
    } catch (e) { 
        // Envía el error al middleware correspondiente
        next(e); 
    }
};

/**
 * Elimina un usuario del sistema de forma permanente.
 * 
 * @param {Object} req - El objeto de la solicitud HTTP. Contiene el ID del usuario en los parámetros de la URL.
 * @param {Object} res - El objeto de la respuesta HTTP.
 * @param {Function} next - Función para pasar el control al siguiente middleware.
 * @returns {Promise<Object>} - Retorna un JSON confirmando la eliminación o un error.
 */
const eliminarUsuario = async (req, res, next) => {
    try {
        // Obtiene el ID del usuario a eliminar y lo convierte a número entero
        const id = parseInt(req.params.id);

        // Verifica que el usuario no intente eliminar su propia cuenta
        if (id === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        }

        // Borra el registro del usuario en la base de datos
        await prisma.usuarios.delete({
            where: { id: id }
        });
        
        // Confirma la operación exitosa al cliente
        res.json({ success: true });
    } catch (e) { 
        // Remite el error al manejador de excepciones global
        next(e); 
    }
};

module.exports = {
    obtenerUsuarios,
    crearUsuario,
    cambiarEstadoUsuario,
    eliminarUsuario
};