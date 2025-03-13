document.addEventListener('DOMContentLoaded', () => {
    const productosList = document.getElementById('productos');
    const productoForm = document.getElementById('productoForm');
    const facturaForm = document.getElementById('facturaForm');
    const descargarReporteBtn = document.getElementById('descargarReporte');

    // Cargar productos al iniciar
    cargarProductos();

    // Escuchar eventos
    productoForm.addEventListener('submit', manejarProductoForm);
    facturaForm.addEventListener('submit', manejarFacturaForm);
    descargarReporteBtn.addEventListener('click', descargarReporte);
});

// Función para cargar productos
const cargarProductos = async () => {
    try {
        const productos = await fetchData('/api/productos');
        const productosList = document.getElementById('productos');

        if (!productosList) {
            throw new Error('El elemento productosList no fue encontrado en el DOM');
        }

        // Limpia la lista antes de agregar nuevos elementos
        productosList.innerHTML = '';

        // Recorre los productos y crea elementos <li> para cada uno
        productos.forEach(producto => {
            const precio = parseFloat(producto.precio); // Convierte el precio a número
            const stock = parseInt(producto.stock, 10); // Convierte el stock a número

            const li = document.createElement('li');
            li.innerHTML = `
                ${producto.nombre} - $${precio.toFixed(2)} (Stock: ${stock})
                <button onclick="editarProducto('${producto.id}')">Editar</button>
                <button onclick="eliminarProducto('${producto.id}')">Eliminar</button>
            `;
            productosList.appendChild(li);
        });
    } catch (error) {
        console.error('Error al cargar productos:', error);
        alert('Error al cargar productos: ' + error.message);
    }
};

// Función para manejar el formulario de productos
const manejarProductoForm = async (e) => {
    e.preventDefault();
    const id = document.getElementById('productoId').value;
    const nombre = document.getElementById('nombre').value;
    const precio = document.getElementById('precio').value;
    const stock = document.getElementById('stock').value;

    const url = id ? `/api/productos/${id}` : '/api/productos';
    const method = id ? 'PUT' : 'POST';

    try {
        await fetchData(url, {
            method,
            body: JSON.stringify({ nombre, precio, stock })
        });
        alert('Producto guardado exitosamente');
        cargarProductos();
        productoForm.reset();
    } catch (error) {
        console.error('Error al guardar el producto:', error);
        alert('Error al guardar el producto');
    }
};

// Función para manejar el formulario de factura
const manejarFacturaForm = async (e) => {
    e.preventDefault();
    const producto_id = document.getElementById('producto_id').value; // Corrige el ID del campo
    const cantidad = document.getElementById('cantidad').value;

    try {
        const venta = await fetchData('/api/factura', {
            method: 'POST',
            body: JSON.stringify({ producto_id, cantidad })
        });
        alert('Venta registrada y stock actualizado');
        cargarProductos();
        descargarFacturaPdf(venta.id);
    } catch (error) {
        console.error('Error al generar la factura:', error);
        alert(`Error al generar la factura: ${error.message}`);
    }
};

// Función para descargar el reporte de ventas
const descargarReporte = async () => {
    try {
        const blob = await fetchBlob('/api/reporte-ventas');
        descargarArchivo(blob, 'ventas.xlsx');
    } catch (error) {
        console.error('Error al descargar el reporte:', error);
        alert('Error al descargar el reporte');
    }
};

// Función para descargar la factura en PDF
const descargarFacturaPdf = async (venta_id) => {
    try {
        const blob = await fetchBlob(`/api/factura-pdf/${venta_id}`);
        descargarArchivo(blob, `factura_${venta_id}.pdf`);
    } catch (error) {
        console.error('Error al descargar la factura:', error);
        alert('Error al descargar la factura');
    }
};

// Función para editar producto
window.editarProducto = async (id) => {
    try {
        const producto = await fetchData(`/api/productos/${id}`);
        document.getElementById('productoId').value = producto.id;
        document.getElementById('nombre').value = producto.nombre;
        document.getElementById('precio').value = producto.precio;
        document.getElementById('stock').value = producto.stock;
    } catch (error) {
        console.error('Error al cargar el producto:', error);
        alert('Error al cargar el producto');
    }
};

// Función para eliminar producto
window.eliminarProducto = async (id) => {
    if (confirm('¿Estás seguro de eliminar este producto?')) {
        try {
            await fetchData(`/api/productos/${id}`, { method: 'DELETE' });
            alert('Producto eliminado exitosamente');
            cargarProductos();
        } catch (error) {
            console.error('Error al eliminar el producto:', error);
            alert('Error al eliminar el producto');
        }
    }
};

// Función genérica para hacer solicitudes fetch y obtener JSON
const fetchData = async (url, options = {}) => {
    const response = await fetch(`http://localhost:3000${url}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error en la solicitud');
    }
    return response.json();
};

// Función genérica para hacer solicitudes fetch y obtener un blob
const fetchBlob = async (url) => {
    const response = await fetch(`http://localhost:3000${url}`);

    if (!response.ok) {
        throw new Error('Error en la solicitud');
    }
    return response.blob();
};

// Función para descargar archivos
const descargarArchivo = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
};