import json, os, re, secrets, subprocess, tempfile, threading, hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote
p=Path(__file__).with_name("print-config.json")
if not p.exists():
    p.write_text(json.dumps({"token":secrets.token_hex(32),"label":"Argox Raf Etiketi","receipt":"GP-H80300","origin":"https://kolaykasam.com","sumatra":str(Path(os.environ.get("LOCALAPPDATA","C:/"))/"SumatraPDF"/"SumatraPDF.exe")},indent=2),encoding="utf-8")
cfg=json.loads(p.read_text(encoding="utf-8"))
if not re.fullmatch(r"[a-f0-9]{64}",cfg["token"]) or cfg["label"].casefold()==cfg["receipt"].casefold():raise SystemExit("Invalid configuration")
lock=threading.Lock()
class H(BaseHTTPRequestHandler):
    def allowed(self):return self.headers.get("Origin")==cfg["origin"] and self.headers.get("Host")=="127.0.0.1:17698"
    def cors(self):
        if self.allowed():
            self.send_header("Access-Control-Allow-Origin",cfg["origin"])
            self.send_header("Vary","Origin")
            self.send_header("Access-Control-Allow-Methods","POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers","Content-Type, X-Print-Token, X-Print-Kind, X-Printer-Name")
            self.send_header("Access-Control-Allow-Private-Network","true")
    def reply(self,status,data):
        b=json.dumps(data).encode();self.send_response(status);self.cors();self.send_header("Content-Type","application/json");self.send_header("Content-Length",str(len(b)));self.end_headers();self.wfile.write(b)
    def do_OPTIONS(self):
        if not self.allowed() or self.path!="/print":return self.reply(403,{"error":"Origin denied"})
        self.send_response(204);self.cors();self.end_headers()
    def do_POST(self):
        if not self.allowed() or self.path!="/print" or not hmac.compare_digest(self.headers.get("X-Print-Token",""),cfg["token"]):return self.reply(403,{"error":"Baglanti kodu veya kaynak gecersiz"})
        k=self.headers.get("X-Print-Kind","")
        if k not in ("label","receipt") or unquote(self.headers.get("X-Printer-Name",""))!=cfg[k]:return self.reply(400,{"error":"Yazici adi eslesmiyor"})
        try:n=int(self.headers.get("Content-Length","0"))
        except ValueError:return self.reply(400,{"error":"Gecersiz boyut"})
        if not 0<n<=20000000 or self.headers.get("Content-Type")!="application/pdf":return self.reply(400,{"error":"Gecersiz PDF"})
        if not lock.acquire(False):return self.reply(409,{"error":"Baski devam ediyor"})
        f=None
        try:
            self.connection.settimeout(15);data=self.rfile.read(n)
            if len(data)!=n or not data.startswith(b"%PDF-1.4") or not data.rstrip().endswith(b"%%EOF"):raise ValueError("PDF gecersiz")
            pages=len(re.findall(rb"/Type\s*/Page\s*/Parent",data))
            if not 1<=pages<=(20 if k=="label" else 1):raise ValueError("Sayfa siniri")
            exe=Path(cfg["sumatra"])
            if not exe.is_file():raise ValueError("SumatraPDF.exe bulunamadi")
            ps="[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; Get-Printer | Select-Object -ExpandProperty Name | ConvertTo-Json -Compress"
            r=subprocess.run(["powershell.exe","-NoProfile","-NonInteractive","-Command",ps],capture_output=True,text=True,encoding="utf-8",timeout=10)
            names=json.loads(r.stdout or "null")
            if isinstance(names,str):names=[names]
            if r.returncode or cfg[k] not in (names or []):raise ValueError("Windows yazici profili bulunamadi")
            with tempfile.NamedTemporaryFile(suffix=".pdf",delete=False) as tmp:tmp.write(data);f=tmp.name
            r=subprocess.run([str(exe),"-print-to",cfg[k],"-print-settings","noscale","-silent",f],timeout=30)
            if r.returncode:raise ValueError("Baski motoru hata verdi")
            self.reply(200,{"ok":True,"pages":pages})
        except Exception as e:self.reply(503,{"error":str(e)[:200]})
        finally:
            if f:
                try:os.unlink(f)
                except OSError:pass
            lock.release()
print("KolayKasam v98 - pencere acik kalmali")
print("Baglanti kodu:",cfg["token"])
print("Config:",p)
ThreadingHTTPServer(("127.0.0.1",17698),H).serve_forever()
