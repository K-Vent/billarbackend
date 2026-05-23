const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    obtenerUsuarios, 
    crearUsuario, 
    eliminarUsuario 
} = require('../controllers/usuarios.controller');

// ==========================================
// RUTAS DE PERSONAL Y GESTIÓN DE ACCESOS (REST API)
// ==========================================

/**
 * @route   GET /api/usuarios
 * @desc    Obtiene la lista del personal activo en el sistema.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.get('/', verificarSesion, soloAdmin, obtenerUsuarios);

/**
 * @route   POST /api/usuarios
 * @desc    Registra un nuevo miembro del personal y le asigna credenciales.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.post('/', verificarSesion, soloAdmin, crearUsuario);

/**
 * @route   DELETE /api/usuarios/:id
 * @desc    Revoca el acceso de un empleado (Soft Delete).
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.delete('/:id', verificarSesion, soloAdmin, eliminarUsuario);

module.exports = router;