const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const exceljs = require('exceljs');
const PdfPrinter = require('pdfmake');
const path = require('path');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({
  origin: 'https://parci-gdba-g2t2-h0phrwhpu-senkiuxs-projects.vercel.app' // Reemplaza con tu dominio de Vercel
}));
app.use(express.json());

// Servir archivos estáticos desde la carpeta "frontend"
app.use(express.static(path.join(__dirname, '../frontend')));

console.log('URL de la base de datos:', process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Ruta para la raíz
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Operaciones CRUD para productos
app.get('/api/productos', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/productos', async (req, res) => {
  const { nombre, precio, stock } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO productos (nombre, precio, stock) VALUES ($1, $2, $3) RETURNING *',
      [nombre, precio, stock]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al agregar producto:', err);
    res.status(500).json({ error: 'Error al agregar producto' });
  }
});

app.put('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  const { nombre, precio, stock } = req.body;
  try {
    const result = await pool.query(
      'UPDATE productos SET nombre = $1, precio = $2, stock = $3 WHERE id = $4 RETURNING *',
      [nombre, precio, stock, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error al actualizar producto:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

app.delete('/api/productos/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM productos WHERE id = $1', [id]);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    console.error('Error al eliminar producto:', err);
    res.status(500).json({ error: 'Error al eliminar producto' });
  }
});

// Reporte de ventas en XLS
app.get('/api/reporte-ventas', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT v.id, v.producto_id, p.nombre AS producto_nombre, v.cantidad, v.fecha
      FROM ventas v
      JOIN productos p ON v.producto_id = p.id
    `);
    const ventas = result.rows;

    const workbook = new exceljs.Workbook();
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
  } catch (err) {
    console.error('Error al generar el reporte de ventas:', err);
    res.status(500).json({ error: 'Error al generar el reporte de ventas' });
  }
});

// Generar factura y actualizar stock
app.post('/api/factura', async (req, res) => {
  const { producto_id, cantidad } = req.body;

  try {
    // Verificar stock
    const producto = await pool.query('SELECT * FROM productos WHERE id = $1', [producto_id]);
    if (!producto.rows[0]) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (producto.rows[0].stock < cantidad) {
      return res.status(400).json({ error: 'Stock insuficiente' });
    }

    // Actualizar stock
    await pool.query('UPDATE productos SET stock = stock - $1 WHERE id = $2', [cantidad, producto_id]);

    // Registrar venta
    const ventaResult = await pool.query(
      'INSERT INTO ventas (producto_id, cantidad) VALUES ($1, $2) RETURNING *',
      [producto_id, cantidad]
    );

    res.json(ventaResult.rows[0]);
  } catch (err) {
    console.error('Error al generar la factura:', err);
    res.status(500).json({ error: 'Error al generar la factura' });
  }
});

// Generar factura en PDF
app.get('/api/factura-pdf/:venta_id', async (req, res) => {
  const { venta_id } = req.params;

  try {
    // Obtener los detalles de la venta
    const ventaResult = await pool.query(`
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
  } catch (err) {
    console.error('Error al generar la factura en PDF:', err);
    res.status(500).json({ error: 'Error al generar la factura en PDF' });
  }
});

// Manejar rutas no encontradas
app.get('*', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});