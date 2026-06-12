/**
 * @fileoverview Rutas para la gestión de usuarios y empleados.
 * Controla la creación, lectura, actualización de estados y eliminación de cuentas del personal.
 */

const express = require('express');
const router = express.Router();

// Importar Middlewares para asegurar que únicamente administradores manejen y modifiquen usuarios
const { verificarSesion, soloAdmin } = require('../middlewares/auth.middleware');

// Importar Controladores con la lógica de negocio CRUD para usuarios
const { 
    obtenerUsuarios, 
    crearUsuario, 
    cambiarEstadoUsuario, 
    eliminarUsuario 
} = require('../controllers/usuarios.controller');

// ==========================================
// RUTAS DE EMPLEADOS (Solo Admin)
// ==========================================

/**
 * Endpoint para listar a todos los empleados/usuarios.
 * @route   GET /api/usuarios/
 * @desc    Obtiene el listado completo de usuarios registrados en el sistema para fines de gestión.
 * @access  Privado y Estricto (Solo Admin)
 */
router.get('/', verificarSesion, soloAdmin, obtenerUsuarios);

/**
 * Endpoint para registrar un nuevo usuario o empleado.
 * @route   POST /api/usuarios/nuevo
 * @desc    Crea de forma segura una nueva cuenta de usuario en la base de datos con sus respectivos roles y permisos.
 * @access  Privado y Estricto (Solo Admin)
 */
router.post('/nuevo', verificarSesion, soloAdmin, crearUsuario);

/**
 * Endpoint para cambiar el estado operativo de un usuario (ej. Activo a Inactivo).
 * @route   PUT /api/usuarios/:id/estado
 * @desc    Activa o desactiva temporalmente el acceso de un usuario al sistema, evitando la eliminación de su historial de la base de datos.
 * @access  Privado y Estricto (Solo Admin)
 * @param   {string} id - Identificador único del usuario a modificar
 */
router.put('/:id/estado', verificarSesion, soloAdmin, cambiarEstadoUsuario);

/**
 * Endpoint para eliminar un usuario definitivamente del sistema.
 * @route   DELETE /api/usuarios/:id
 * @desc    Elimina de forma permanente un registro de usuario. Recomendable utilizar solo en casos excepcionales por trazabilidad.
 * @access  Privado y Estricto (Solo Admin)
 * @param   {string} id - Identificador único del usuario a eliminar
 */
router.delete('/:id', verificarSesion, soloAdmin, eliminarUsuario);

// Exportar el enrutador para que sea inyectado en el servidor principal
module.exports = router;