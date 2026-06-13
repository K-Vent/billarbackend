const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');

// ==========================================
// CONTROLADOR DE INVENTARIO Y PRODUCTOS
// ==========================================

/**
 * Obtiene el catálogo de productos disponibles en el sistema.
 * Implementa un filtro de "Soft Delete" para excluir productos retirados del menú.
 *
 * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 * @returns {Promise<void>}
 */
const obtenerProductos = async (req, res, next) => {
    try {
        // SOFT DELETE: Solo extraemos los productos cuyo estado sea 'activo'
        // Esto evita mostrar productos que han sido lógicamente eliminados
        const productos = await prisma.productos.findMany({
            where: {
                estado: 'activo'
            },
            orderBy: {
                id: 'asc'
            }
        });

        // Retornamos la lista de productos activos en formato JSON al cliente
        res.json(productos);
    } catch (e) { 
        // Pasamos el error al middleware centralizado de manejo de errores
        next(e); 
    }
};

/**
 * Ingresa un nuevo producto al catálogo general.
 * Convierte los tipos de datos recibidos del cliente al formato requerido por la base de datos.
 *
 * @param {Object} req - Objeto de petición HTTP que contiene los detalles del producto en req.body
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 * @returns {Promise<void>}
 */
const crearProducto = async (req, res, next) => {
    try {
        // Extraemos los atributos del producto desde el cuerpo de la petición
        const { nombre, precio, stock, categoria } = req.body; 
        
        // Creamos un nuevo registro en la base de datos a través de Prisma
        // Aseguramos la conversión correcta de los datos:
        // - 'precio' se convierte a Float
        // - 'stock' se convierte a Integer de base 10
        await prisma.productos.create({
            data: {
                nombre: nombre,
                precio_venta: parseFloat(precio),
                stock: parseInt(stock, 10),
                categoria: categoria || 'General',
                // Forzamos el estado activo al momento de su creación para que sea visible de inmediato
                estado: 'activo'
            }
        });

        // Respondemos con éxito tras la creación en la base de datos
        res.json({ success: true });
    } catch (e) { 
        // Delegamos cualquier excepción que ocurra (ej. error de conexión) al middleware de errores
        next(e); 
    }
};

/**
 * Retira un producto del catálogo de ventas sin destruir sus datos físicos.
 * Utiliza "Soft Delete" (actualización de estado) para garantizar la integridad 
 * referencial de ventas, boletas y auditorías pasadas.
 *
 * @param {Object} req - Objeto de petición HTTP, incluyendo los parámetros de la URL (req.params.id)
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 * @returns {Promise<void>}
 */
const eliminarProducto = async (req, res, next) => {
    try {
        // Convertimos el ID recibido por URL de string a entero para la consulta de Prisma usando Zod
        const id = z.coerce.number().int().parse(req.params.id);
        
        // SOFT DELETE: Actualizamos el estado a 'inactivo' para inhabilitarlo en el frontend,
        // sin aplicar un DELETE real en la base de datos para no afectar el historial.
        await prisma.productos.update({
            where: { 
                id: id 
            },
            data: { 
                estado: 'inactivo' 
            }
        });

        // Notificamos al cliente que la operación de retiro lógico fue exitosa
        res.json({ success: true, message: 'Producto retirado del inventario exitosamente.' });
    } catch (e) { 
        // Pasamos el error al manejador correspondiente
        next(e); 
    }
};

/**
 * Actualiza los detalles de un producto existente en el catálogo.
 * Permite modificar nombre, precio de venta, stock y categoría del producto indicado.
 *
 * @param {Object} req - Objeto de petición HTTP que contiene el ID en los params y los nuevos datos en el body
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 * @returns {Promise<void>}
 */
const actualizarProducto = async (req, res, next) => {
    try {
        // Identificamos el producto a editar extrayendo y convirtiendo el ID de la URL usando Zod
        const id = z.coerce.number().int().parse(req.params.id);
        
        // Obtenemos los nuevos valores a actualizar desde el cuerpo de la petición
        const { nombre, precio, stock, categoria } = req.body;
        
        // Ejecutamos la actualización mediante Prisma, buscando el producto por su ID
        // Es necesario realizar el parseo de datos (float y entero) para mantener la consistencia
        await prisma.productos.update({
            where: { id: id },
            data: {
                nombre: nombre,
                precio_venta: parseFloat(precio),
                stock: parseInt(stock, 10),
                categoria: categoria || 'General' // Establece una categoría por defecto en caso de no proveerse
            }
        });

        // Emitimos una respuesta de confirmación una vez aplicados los cambios
        res.json({ success: true, message: 'Producto actualizado.' });
    } catch (e) {
        // Derivamos el posible error de base de datos o de ejecución
        next(e);
    }
};

module.exports = { 
    obtenerProductos, 
    crearProducto, 
    eliminarProducto,
    actualizarProducto 
};