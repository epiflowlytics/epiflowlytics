/**
 * Proxy server sederhana untuk meneruskan request ke SATUSEHAT.
 * Tujuan: dijalankan di komputer Anda (IP tidak diblokir SATUSEHAT),
 * lalu diekspos ke internet lewat Cloudflare Tunnel, supaya Edge Function
 * Supabase bisa memanggil SATUSEHAT lewat proxy ini.
 *
 * Cara pakai:
 *   1. npm init -y
 *   2. npm install express node-fetch@2 cors
 *   3. node proxy-server.js
 *   4. Di terminal lain: cloudflared tunnel --url http://localhost:3000
 *   5. Pakai URL yang diberikan cloudflared sebagai AUTH_URL di Edge Function
 */

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// Base URL SATUSEHAT — ganti sesuai environment Anda (sandbox/production)
const SATUSEHAT_BASE_URL = process.env.SATUSEHAT_BASE_URL || 'https://api-satusehat-stg.dto.kemkes.go.id';

// Endpoint kesehatan sederhana untuk cek proxy hidup
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Proxy server berjalan' });
});

// Proxy generik: apapun yang dikirim ke /proxy/* akan diteruskan ke SATUSEHAT
app.all('/proxy/*', async (req, res) => {
  try {
    const targetPath = req.originalUrl.replace('/proxy', '');
    const targetUrl = `${SATUSEHAT_BASE_URL}${targetPath}`;

    console.log(`[PROXY] ${req.method} ${targetUrl}`);

    // Salin header penting dari request asli (terutama Authorization & Content-Type)
    const forwardHeaders = {};
    if (req.headers['authorization']) {
      forwardHeaders['Authorization'] = req.headers['authorization'];
    }
    if (req.headers['content-type']) {
      forwardHeaders['Content-Type'] = req.headers['content-type'];
    }

    const fetchOptions = {
      method: req.method,
      headers: forwardHeaders,
    };

    // Kalau method punya body (POST/PUT/PATCH), teruskan body-nya
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
      if (req.headers['content-type']?.includes('application/x-www-form-urlencoded')) {
        // SATUSEHAT auth endpoint biasanya pakai x-www-form-urlencoded
        const params = new URLSearchParams(req.body).toString();
        fetchOptions.body = params;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    const response = await fetch(targetUrl, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.status(response.status).json(data);
    } else {
      const text = await response.text();
      return res.status(response.status).send(text);
    }
  } catch (err) {
    console.error('[PROXY ERROR]', err);
    res.status(500).json({ error: 'Proxy gagal meneruskan request', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server jalan di http://localhost:${PORT}`);
  console.log(`Cek kesehatan proxy di http://localhost:${PORT}/health`);
  console.log(`Semua request ke /proxy/* akan diteruskan ke ${SATUSEHAT_BASE_URL}`);
});
