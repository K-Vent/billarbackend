/**
 * @file inventario.routes.js
 * @description Rutas para la gestión del inventario y catálogo de productos.
 * Define los endpoints para consultar, crear, actualizar y eliminar productos.
 */

const express = require('express');
const router = express.Router();

// Middlewares de Seguridad (IAM)
// Se importan las funciones para validar el token y los roles de usuario
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Controladores de Negocio
// Importación de las funciones lógicas responsables de procesar las peticiones del inventario
const { 
    obtenerProductos, 
    crearProducto, 
    eliminarProducto,
    actualizarProducto 
} = require('../controllers/inventario.controller');

// ==========================================
// RUTAS DE INVENTARIO Y CATÁLOGO
// ==========================================

/**
 * @route   GET /api/productos
 * @desc    Obtiene el catálogo completo de productos activos para su visualización y venta.
 *          La ruta está protegida y requiere que el empleado inicie sesión.
 * @access  Privado (Cualquier empleado autenticado)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware - Middleware para verificar la sesión del usuario.
 * @param {Function} handler - Controlador que devuelve los productos.
 */
router.get('/productos', verificarSesion, obtenerProductos);

/**
 * @route   GET /api/menu-publico
 * @desc    Retorna el catálogo activo para acceso al público general.
 *          Ideal para mostrar la carta digital o en la página principal (home page).
 * @access  Público
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} handler - Controlador que devuelve el menú público.
 */
router.get('/menu-publico', obtenerProductos);

/**
 * @route   POST /api/productos/nuevo
 * @desc    Registra un nuevo producto en el catálogo del restaurante.
 *          Requiere verificación de sesión y permisos de administrador.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 * @function
 * @param {string} path - Ruta del endpoint.
 * @param {Function} middleware1 - Middleware para verificar la sesión.
 * @param {Function} middleware2 - Middleware para autorizar solo a administradores.
 * @param {Function} handler - Controlador que procesa la creación del producto.
 */
router.post('/productos/nuevo', verificarSesion, soloAdmin, crearProducto);

/**
 * @route   DELETE /api/productos/eliminar/:id
 * @desc    Realiza un borrado lógico (Soft Delete) de un producto.
 *          Esto permite ocultar el producto sin afectar el historial de ventas.
 *          Requiere sesión activa y permisos administrativos.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 * @function
 * @param {string} path - Ruta del endpoint con el parámetro de ID del producto.
 * @param {Function} middleware1 - Middleware para verificar la sesión.
 * @param {Function} middleware2 - Middleware para autorizar solo a administradores.
 * @param {Function} handler - Controlador que ejecuta el borrado lógico.
 */
router.delete('/productos/eliminar/:id', verificarSesion, soloAdmin, eliminarProducto);

/**
 * @route   PUT /api/productos/actualizar/:id
 * @desc    Actualiza atributos de un producto existente, tales como el precio, stock o nombre.
 *          Se debe validar la sesión y verificar que el usuario sea administrador.
 * @access  Privado y Estricto (Solo Administradores/Gerencia)
 * @function
 * @param {string} path - Ruta del endpoint con el ID del producto a modificar.
 * @param {Function} middleware1 - Middleware para verificar la sesión activa.
 * @param {Function} middleware2 - Middleware de validación de rol de administrador.
 * @param {Function} handler - Controlador que actualiza los datos del producto.
 */
router.put('/productos/actualizar/:id', verificarSesion, soloAdmin, actualizarProducto);

// Se exporta el enrutador para ser montado en la aplicación principal
module.exports = router;