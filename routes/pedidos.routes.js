/**
 * @fileoverview Rutas para la gestión de pedidos y KDS (Kitchen Display System).
 * Define los endpoints para crear, eliminar y gestionar estados de los pedidos.
 */

const express = require('express');
const router = express.Router();

// Importar Middlewares de Seguridad (IAM) para proteger las rutas
const { verificarSesion } = require('../middlewares/auth.middleware');

// Importar Controladores de Negocio que manejan la lógica de cada ruta
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
 * Endpoint para obtener la cola de preparación en tiempo real.
 * @route   GET /api/kds/pendientes
 * @desc    Obtiene la cola de preparación en tiempo real para el KDS. Ideal para que la cocina visualice qué preparar.
 * @access  Privado (Requiere sesión activa)
 * @returns {Array} Lista de pedidos con estado pendiente
 */
router.get('/kds/pendientes', verificarSesion, obtenerPedidosPendientes);

/**
 * Endpoint para marcar un pedido como entregado.
 * @route   POST /api/kds/entregar/:id
 * @desc    Marca un pedido como preparado/entregado y lo retira de la pantalla KDS de forma inmediata.
 * @access  Privado (Requiere sesión activa)
 * @param   {string} id - Identificador único del pedido a marcar como entregado
 */
router.post('/kds/entregar/:id', verificarSesion, marcarEntregado);


// ==========================================
// RUTAS DE GESTIÓN DE PEDIDOS (PUNTO DE VENTA)
// ==========================================

/**
 * Endpoint para crear o agregar un pedido.
 * @route   POST /api/pedidos/agregar
 * @desc    Añade productos a una mesa, descuenta stock de inventario automáticamente y alerta a la cocina mediante el KDS.
 * @access  Privado (Requiere sesión activa)
 */
router.post('/pedidos/agregar', verificarSesion, crearPedido);

/**
 * Endpoint para anular o eliminar un pedido.
 * @route   DELETE /api/pedidos/eliminar/:id
 * @desc    Anula un pedido erróneo, devuelve el stock al inventario para mantener consistencia y audita la acción.
 * @access  Privado (Considerar añadir 'soloAdmin' en el futuro si hay mermas)
 * @param   {string} id - Identificador único del pedido a anular
 */
router.delete('/pedidos/eliminar/:id', verificarSesion, eliminarPedido);

// Exportar el enrutador para ser montado en la aplicación principal
module.exports = router;