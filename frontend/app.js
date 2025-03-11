document.addEventListener('DOMContentLoaded', () => {
    const productosList = document.getElementById('productos');
    const productoForm = document.getElementById('productoForm');
    const facturaForm = document.getElementById('facturaForm');
    const descargarReporteBtn = document.getElementById('descargarReporte');

    // Cargar productos
    const cargarProductos = async () => {
        const response = await fetch('http://localhost:5000/api/productos');
        const productos = await response.json();
        productosList.innerHTML = productos.map(p => `
            <li>
                ${p.nombre} - $${p.precio} (Stock: ${p.stock})
                <button onclick="editarProducto('${p.id}')">Editar</button>
                <button onclick="eliminarProducto('${p.id}')">Eliminar</button>
            </li>
        `).join('');
    };

    // Agregar o modificar producto
    productoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('productoId').value;
        const nombre = document.getElementById('nombre').value;
        const precio = document.getElementById('precio').value;
        const stock = document.getElementById('stock').value;

        const url = id ? `http://localhost:5000/api/productos/${id}` : 'http://localhost:5000/api/productos';
        const method = id ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nombre, precio, stock })
        });

        if (response.ok) {
            alert('Producto guardado exitosamente');
            cargarProductos();
            productoForm.reset();
        } else {
            alert('Error al guardar el producto');
        }
    });

    // Editar producto
    window.editarProducto = async (id) => {
        const response = await fetch(`http://localhost:5000/api/productos/${id}`);
        const producto = await response.json();
        document.getElementById('productoId').value = producto.id;
        document.getElementById('nombre').value = producto.nombre;
        document.getElementById('precio').value = producto.precio;
        document.getElementById('stock').value = producto.stock;
    };

    // Eliminar producto
    window.eliminarProducto = async (id) => {
        if (confirm('¿Estás seguro de eliminar este producto?')) {
            const response = await fetch(`http://localhost:5000/api/productos/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                alert('Producto eliminado exitosamente');
                cargarProductos();
            } else {
                alert('Error al eliminar el producto');
            }
        }
    };

    // Generar factura
    facturaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const producto_id = document.getElementById('producto_id').value;
        const cantidad = document.getElementById('cantidad').value;

        console.log('Datos enviados:', { producto_id, cantidad }); // Depuración

        const response = await fetch('http://localhost:5000/api/factura', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ producto_id, cantidad })
        });

        if (response.ok) {
            const venta = await response.json();
            alert('Venta registrada y stock actualizado');
            cargarProductos();
            descargarFacturaPdf(venta.id); // Descargar la factura en PDF
        } else {
            const error = await response.json();
            console.error('Error del backend:', error); // Depuración
            alert(`Error al generar la factura: ${error.error}`);
        }
    });

    // Descargar reporte
    descargarReporteBtn.addEventListener('click', async () => {
        const response = await fetch('http://localhost:5000/api/reporte-ventas');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ventas.xlsx';
        a.click();
    });

    // Función para descargar la factura en PDF
    const descargarFacturaPdf = async (venta_id) => {
        const response = await fetch(`http://localhost:5000/api/factura-pdf/${venta_id}`);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `factura_${venta_id}.pdf`;
        a.click();
    };

    cargarProductos(); // Cargar productos al iniciar
});