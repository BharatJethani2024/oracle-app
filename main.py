import os
import subprocess
import tempfile
from flask import Flask, request, send_file, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/')
def index():
    return jsonify({'status': 'Oracle is running'})

@app.route('/download')
def download():
    url = request.args.get('url')
    if not url:
        return jsonify({'error': 'Missing url'}), 400

    tmp = tempfile.mktemp(suffix='.mp4')

    try:
        result = subprocess.run([
            'yt-dlp',
            url,
            '-f', 'best[ext=mp4]/best',
            '--no-playlist',
            '--max-filesize', '500m',
            '-o', tmp
        ], capture_output=True, text=True, timeout=120)

        if result.returncode != 0:
            err = result.stderr
            msg = 'Could not download this video'
            if 'Unsupported URL' in err: msg = 'URL not supported'
            if 'Private' in err: msg = 'Video is private'
            if 'unavailable' in err: msg = 'Video is unavailable'
            return jsonify({'error': msg}), 422

        if not os.path.exists(tmp):
            return jsonify({'error': 'File not found'}), 500

        return send_file(tmp, as_attachment=True, download_name='oracle_video.mp4', mimetype='video/mp4')

    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3000))
    app.run(host='0.0.0.0', port=port)
