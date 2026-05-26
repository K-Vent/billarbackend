const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ==========================================
// CONTROLADOR DE INVENTARIO Y PRODUCTOS
// ==========================================

/**
 * Obtiene el catálogo de productos disponibles en el sistema.
 * Implementa un filtro de "Soft Delete" para excluir productos retirados del menú.
 * * @param {Object} req - Objeto de petición HTTP
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const obtenerProductos = async (req, res, next) => {
    try {
        // SOFT DELETE: Solo extraemos los productos que siguen activos
        const productos = await prisma.productos.findMany({
            where: {
                estado: 'activo'
            },
            orderBy: {
                id: 'asc'
            }
        });

        res.json(productos);
    } catch (e) { 
        // Pasamos el error al middleware centralizado
        next(e); 
    }
};

/**
 * Ingresa un nuevo producto al catálogo general.
 * * @param {Object} req - Objeto de petición HTTP (body con detalles del producto)
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const crearProducto = async (req, res, next) => {
    try {
        const { nombre, precio, stock, categoria } = req.body; 
        
        // Asignamos explícitamente el valor "precio" a la columna "precio_venta"
        await prisma.productos.create({
            data: {
                nombre: nombre,
                precio_venta: precio,
                stock: stock,
                categoria: categoria,
                estado: 'activo' // Valor por defecto asegurado desde la aplicación
            }
        });

        res.json({ success: true });
    } catch (e) { 
        next(e); 
    }
};

/**
 * Retira un producto del catálogo de ventas sin destruir sus datos.
 * Utiliza "Soft Delete" (actualización de estado) para garantizar la integridad 
 * referencial de las ventas, boletas y auditorías pasadas.
 * * @param {Object} req - Objeto de petición HTTP (params con ID del producto)
 * @param {Object} res - Objeto de respuesta HTTP
 * @param {Function} next - Middleware de manejo de errores
 */
const eliminarProducto = async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        
        // SOFT DELETE: Actualizamos el estado para inhabilitarlo en el frontend
        await prisma.productos.update({
            where: { 
                id: id 
            },
            data: { 
                estado: 'inactivo' 
            }
        });

        res.json({ success: true, message: 'Producto retirado del inventario exitosamente.' });
    } catch (e) { 
        next(e); 
    }
};

module.exports = { 
    obtenerProductos, 
    crearProducto, 
    eliminarProducto 
};