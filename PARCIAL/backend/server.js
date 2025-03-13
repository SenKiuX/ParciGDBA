require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Client } = require('pg');
const ExcelJS = require('exceljs');
const PdfPrinter = require('pdfmake');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Servir archivos estáticos desde la carpeta "frontend"
app.use(express.static(path.join(__dirname, '../frontend')));

console.log('URL de la base de datos:', process.env.DATABASE_URL);

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

client.connect()
    .then(() => {
        console.log('Conexión a la base de datos exitosa');
    })
    .catch((err) => {
        console.error('Error al conectar a la base de datos:', err);
    });

// Ruta para la raíz
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Operaciones CRUD para productos
app.get('/api/productos', async (req, res) => {
    const result = await client.query('SELECT * FROM productos');
    res.json(result.rows);
});

app.post('/api/productos', async (req, res) => {
    const { nombre, precio, stock } = req.body;
    const result = await client.query(
        'INSERT INTO productos (nombre, precio, stock) VALUES ($1, $2, $3) RETURNING *',
        [nombre, precio, stock]
    );
    res.json(result.rows[0]);
});

app.put('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, stock } = req.body;
    const result = await client.query(
        'UPDATE productos SET nombre = $1, precio = $2, stock = $3 WHERE id = $4 RETURNING *',
        [nombre, precio, stock, id]
    );
    res.json(result.rows[0]);
});

app.delete('/api/productos/:id', async (req, res) => {
    const { id } = req.params;
    await client.query('DELETE FROM productos WHERE id = $1', [id]);
    res.json({ message: 'Producto eliminado' });
});

// Reporte de ventas en XLS
app.get('/api/reporte-ventas', async (req, res) => {
    const result = await client.query(`
        SELECT v.id, v.producto_id, p.nombre AS producto_nombre, v.cantidad, v.fecha
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
    `);
    const ventas = result.rows;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ventas');

    // Agregar encabezados
    worksheet.columns = [
        { header: 'ID', key: 'id', width: 30 },
        { header: 'Producto ID', key: 'producto_id', width: 30 },
        { header: 'Nombre del Producto', key: 'producto_nombre', width: 30 },
        { header: 'Cantidad', key: 'cantidad', width: 15 },
        { header: 'Fecha', key: 'fecha', width: 20 }
    ];

    // Agregar datos
    ventas.forEach(venta => {
        worksheet.addRow(venta);
    });

    // Escribir el archivo en un buffer
    const buffer = await workbook.xlsx.writeBuffer();

    // Enviar el archivo como respuesta
    res.setHeader('Content-Disposition', 'attachment; filename=ventas.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
});

// Generar factura y actualizar stock
app.post('/api/factura', async (req, res) => {
    const { producto_id, cantidad } = req.body;

    console.log('Datos recibidos:', { producto_id, cantidad }); // Depuración

    // Verificar stock
    const producto = await client.query('SELECT * FROM productos WHERE id = $1', [producto_id]);
    console.log('Producto encontrado:', producto.rows[0]); // Depuración

    if (!producto.rows[0]) {
        return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (producto.rows[0].stock < cantidad) {
        return res.status(400).json({ error: 'Stock insuficiente' });
    }

    // Actualizar stock
    await client.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [cantidad, producto_id]);

    // Registrar venta
    const ventaResult = await client.query(
        'INSERT INTO ventas (producto_id, cantidad) VALUES ($1, $2) RETURNING *',
        [producto_id, cantidad]
    );

    console.log('Venta registrada:', ventaResult.rows[0]); // Depuración

    res.json(ventaResult.rows[0]);
});

// Generar factura en PDF
app.get('/api/factura-pdf/:venta_id', async (req, res) => {
    const { venta_id } = req.params;

    // Obtener los detalles de la venta
    const ventaResult = await client.query(`
        SELECT v.id, v.producto_id, p.nombre AS producto_nombre, v.cantidad, v.fecha, p.precio
        FROM ventas v
        JOIN productos p ON v.producto_id = p.id
        WHERE v.id = $1
    `, [venta_id]);

    const venta = ventaResult.rows[0];

    if (!venta) {
        return res.status(404).json({ error: 'Venta no encontrada' });
    }

    // Crear el contenido del PDF
    const fonts = {
        Helvetica: {
            normal: 'Helvetica',
            bold: 'Helvetica-Bold',
            italics: 'Helvetica-Oblique',
            bolditalics: 'Helvetica-BoldOblique'
        }
    };

    const printer = new PdfPrinter(fonts);

    const docDefinition = {
        content: [
            { text: 'Factura de Venta', style: 'header' },
            { text: `Número de Factura: ${venta.id}`, style: 'subheader' },
            { text: `Fecha: ${new Date(venta.fecha).toLocaleDateString()}`, style: 'subheader' },
            { text: '\nDetalles de la Venta:', style: 'subheader' },
            {
                table: {
                    widths: ['', '', '', ''],
                    body: [
                        ['Producto ID', 'Nombre del Producto', 'Cantidad', 'Precio Unitario'],
                        [venta.producto_id, venta.producto_nombre, venta.cantidad, `$${venta.precio}`]
                    ]
                }
            },
            { text: `\nTotal: $${venta.cantidad * venta.precio}`, style: 'total' }
        ],
        styles: {
            header: {
                fontSize: 18,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10]
            },
            subheader: {
                fontSize: 14,
                bold: true,
                margin: [0, 10, 0, 5]
            },
            total: {
                fontSize: 16,
                bold: true,
                alignment: 'right',
                margin: [0, 10, 0, 0]
            }
        },
        defaultStyle: {
            font: 'Helvetica'
        }
    };

    const pdfDoc = printer.createPdfKitDocument(docDefinition);

    // Configurar la respuesta
    res.setHeader('Content-Disposition', `attachment; filename=factura_${venta.id}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');

    // Enviar el PDF
    pdfDoc.pipe(res);
    pdfDoc.end();
});

// Manejar rutas no encontradas
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});