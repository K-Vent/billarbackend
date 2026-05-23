const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
const { verificarSesion } = require('../middlewares/auth.middleware');

// Controladores de Negocio
const { 
    obtenerPedidosPendientes, 
    marcarEntregado, 
    crearPedido, 
    eliminarPedido 
} = require('../controllers/pedidos.controller');

// ==========================================
// RUTAS DE KDS (PANTALLA DE COCINA / BARRA)
// ==========================================

/**
 * @route   GET /api/kds/pendientes
 * @desc    Obtiene la cola de preparación en tiempo real para el KDS.
 * @access  Privado
 */
router.get('/kds/pendientes', verificarSesion, obtenerPedidosPendientes);

/**
 * @route   POST /api/kds/entregar/:id
 * @desc    Marca un pedido como preparado/entregado y lo retira de la pantalla KDS.
 * @access  Privado
 */
router.post('/kds/entregar/:id', verificarSesion, marcarEntregado);


// ==========================================
// RUTAS DE GESTIÓN DE PEDIDOS (PUNTO DE VENTA)
// ==========================================

/**
 * @route   POST /api/pedidos/agregar
 * @desc    Añade productos a una mesa, descuenta stock y alerta a la cocina.
 * @access  Privado
 */
router.post('/pedidos/agregar', verificarSesion, crearPedido);

/**
 * @route   DELETE /api/pedidos/eliminar/:id
 * @desc    Anula un pedido erróneo, devuelve el stock al inventario y audita la acción.
 * @access  Privado (Considerar añadir 'soloAdmin' en el futuro si hay mermas)
 */
router.delete('/pedidos/eliminar/:id', verificarSesion, eliminarPedido);

module.exports = router;