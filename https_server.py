import http.server
import ssl
import socketserver

PORT = 443  # HTTPS Standard-Port
DIRECTORY = "/home/minkerpro99/Webpage"

class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        super().do_GET()

httpd = socketserver.TCPServer(("", PORT), Handler)
httpd.directory = DIRECTORY

httpd.socket = ssl.wrap_socket(
    httpd.socket,
    keyfile="/etc/letsencrypt/live/minkerpage.ddns.net/privkey.pem",
    certfile="/etc/letsencrypt/live/minkerpage.ddns.net/fullchain.pem",
    server_side=True
)

print(f"Serving HTTPS on port {PORT}")
httpd.serve_forever()
