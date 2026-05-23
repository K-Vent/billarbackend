const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    obtenerProductos, 
    crearProducto, 
    eliminarProducto 
} = require('../controllers/inventario.controller');

// ==========================================
// RUTAS DE INVENTARIO Y CATÁLOGO
// ==========================================

/**
 * @route   GET /api/productos
 * @desc    Obtiene el catálogo de productos activos para visualización y ventas.
 * @access  Privado (Cualquier empleado autenticado)
 */
router.get('/', verificarSesion, obtenerProductos);

/**
 * @route   POST /api/productos/nuevo
 * @desc    Registra un nuevo producto en el catálogo.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.post('/nuevo', verificarSesion, soloAdmin, crearProducto);

/**
 * @route   DELETE /api/productos/eliminar/:id
 * @desc    Realiza un borrado lógico (Soft Delete) de un producto para no afectar el historial.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 */
router.delete('/eliminar/:id', verificarSesion, soloAdmin, eliminarProducto);

module.exports = router;