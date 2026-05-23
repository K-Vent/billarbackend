const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

// ==========================================
// CONTROLADOR DE USUARIOS Y GESTIÓN DE ACCESOS
// ==========================================

/**
 * Obtiene la lista del personal con acceso activo al sistema.
 * Implementa proyección estricta para garantizar que el hash de la contraseña 
 * jamás viaje al frontend bajo ninguna circunstancia.
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const obtenerUsuarios = async (req, res, next) => { 
    try { 
        const usuarios = await prisma.usuarios.findMany({
            where: {
                estado: 'activo'
            },
            // 🛡️ SEGURIDAD: Solo extraemos los campos no sensibles.
            select: {
                id: true,
                username: true,
                rol: true
                // password queda implícitamente excluido
            },
            orderBy: {
                id: 'asc'
            }
        });

        res.json(usuarios); 
    } catch (e) { 
        next(e); 
    } 
};

/**
 * Registra a un nuevo miembro del personal en el sistema.
 * Verifica disponibilidad del nombre de usuario y encripta la credencial.
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const crearUsuario = async (req, res, next) => { 
    try { 
        const { username, password, rol } = req.body; 
        
        // 1. Verificación de colisión de identidades
        const usuarioExistente = await prisma.usuarios.findFirst({
            where: {
                username: username,
                estado: 'activo'
            }
        });

        if (usuarioExistente) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso en el sistema.' });
        }

        // 2. Encriptación asimétrica de la credencial (Cost: 10)
        const hash = await bcrypt.hash(password, 10); 
        
        // 3. Persistencia en la base de datos
        await prisma.usuarios.create({
            data: {
                username: username,
                password: hash,
                rol: rol,
                estado: 'activo'
            }
        });

        res.json({ success: true }); 
    } catch (e) { 
        next(e); 
    } 
};

/**
 * Revoca el acceso a un usuario de manera lógica (Soft Delete).
 * Previene la auto-revocación para evitar bloqueos administrativos.
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const eliminarUsuario = async (req, res, next) => { 
    try { 
        const id = parseInt(req.params.id); 
        
        // 🛡️ REGLA DE NEGOCIO: Prevención de auto-eliminación
        // req.usuario.id viene del middleware de autenticación (JWT/Session)
        if (id === req.usuario.id) {
            return res.status(400).json({ error: 'Denegado: No puedes desactivar tu propia cuenta.' });
        }
        
        // 🛡️ SOFT DELETE: Mutamos el estado a inactivo, conservando el ID 
        // para que las ventas y auditorías pasadas no queden huérfanas.
        await prisma.usuarios.update({
            where: { id: id },
            data: { estado: 'inactivo' }
        });

        res.json({ success: true, message: 'Usuario desactivado y acceso revocado correctamente.' }); 
    } catch (e) { 
        next(e); 
    } 
};

module.exports = { 
    obtenerUsuarios, 
    crearUsuario, 
    eliminarUsuario 
};