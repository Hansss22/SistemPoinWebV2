# cobaWeb (HTML/CSS/JS)

Versi web sederhana dari aplikasi Flutter (tanpa framework, tanpa build).

## Cara menjalankan

### Mode 1: Pakai database (disarankan)

Ini mode **pakai database SQLite** lewat backend Node.js.

```bash
cd cobaWeb/server
npm install
npm run dev
```

Lalu buka `http://localhost:5173` (server juga melayani file HTML/CSS/JS).

### Mode 2: Tanpa database (static)

Buka `cobaWeb/index.html` langsung di browser, atau jalankan server statik:

```bash
cd cobaWeb
python -m http.server 8080
```

Lalu buka `http://localhost:8080`.

## Login

- Default: `admin` / `12345`
- Atau daftar akun baru lewat menu **Daftar**

## Penyimpanan data

- **Mode database**: data disimpan di `cobaWeb/server/data.sqlite`
- **Mode static**: data disimpan di `localStorage` browser

