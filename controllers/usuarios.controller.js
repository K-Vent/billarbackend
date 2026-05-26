const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

// ==========================================
// CONTROLADOR DE EMPLEADOS (USUARIOS)
// ==========================================

const obtenerUsuarios = async (req, res, next) => {
    try {
        const usuarios = await prisma.usuarios.findMany({
            select: { id: true, username: true, rol: true, estado: true }
        });
        res.json(usuarios);
    } catch (e) { next(e); }
};

const crearUsuario = async (req, res, next) => {
    try {
        const { username, password, rol } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        const existe = await prisma.usuarios.findUnique({ where: { username } });
        if (existe) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso.' });
        }

        const hash = await bcrypt.hash(password, 10);
        
        await prisma.usuarios.create({
            data: {
                username: username,
                password: hash,
                rol: rol || 'staff',
                estado: 'activo'
            }
        });
        
        res.json({ success: true });
    } catch (e) { next(e); }
};

const cambiarEstadoUsuario = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const { estado } = req.body; // 'activo' o 'inactivo'
        
        // Evitar que el admin se desactive a sí mismo
        if (id === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta activa.' });
        }

        await prisma.usuarios.update({
            where: { id: id },
            data: { estado: estado }
        });
        
        res.json({ success: true });
    } catch (e) { next(e); }
};

const eliminarUsuario = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);

        if (id === req.usuario.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
        }

        await prisma.usuarios.delete({
            where: { id: id }
        });
        
        res.json({ success: true });
    } catch (e) { next(e); }
};

module.exports = {
    obtenerUsuarios,
    crearUsuario,
    cambiarEstadoUsuario,
    eliminarUsuario
};