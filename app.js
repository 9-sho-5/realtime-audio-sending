const express = require('express')
const http = require('http')
const path = require('path')
const socketio = require('socket.io')
const WavEncoder = require('wav-encoder')
const fs = require('fs')
const app = express()

const dgram = require('dgram');
// RTP関連の設定
const rtpPayloadType = 0; // RTPペイロードタイプ（0はPCMUやPCMAなどのオーディオコーデックに対応）
let sequenceNumber = 0; // シーケンス番号
let timestamp = 0; // タイムスタンプ
const ssrc = Math.floor(Math.random() * 0xffffffff); // SSRC（送信元識別子）

app.use('/', express.static(path.join(__dirname, 'public')))

server = http.createServer(app).listen(4000, function() {
    console.log('Example app listening on port 4000')
})

const io = socketio(server)

io.on('connection', (socket) => {
    let sampleRate = 48000
    let buffer = []

    socket.on('start', (data) => {
        sampleRate = data.sampleRate
        console.log(`Sample Rate: ${sampleRate}`)
    })

    socket.on('send_pcm', (data) => {
        // data: { "1": 11, "2": 29, "3": 33, ... }
        console.log(data);
        
        const itr = data.values()
        const buf = new Array(data.length)
        for (var i = 0; i < buf.length; i++) {
            buf[i] = itr.next().value
        }
        buffer = buffer.concat(buf)

        const packetSize = 1400; // 送信するRTPパケットの最大サイズ（例: 1400バイト）
        var rtpPacket = convertPcmToRtp(data, packetSize);

        const udpSocket = dgram.createSocket('udp4');
        // RTPパケットを適切な宛先IPアドレスとポートに送信
        const remoteIP = '192.168.3.1';
        const remotePort = 5004;

        udpSocket.send(rtpPacket, remotePort, remoteIP, (err) => {
            if (err) {
              console.error('Failed to send RTP packet:', err);
            } else {
              console.log('RTP packet sent successfully.');
            }
        });
    })

    socket.on('stop', (data, ack) => {
        const f32array = toF32Array(buffer)
        const filename = `public/wav/${String(Date.now())}.wav`
        exportWAV(f32array, sampleRate, filename)
        ack({ filename: filename })
    })
})

// Convert byte array to Float32Array
const toF32Array = (buf) => {
    const buffer = new ArrayBuffer(buf.length)
    const view = new Uint8Array(buffer)
    for (var i = 0; i < buf.length; i++) {
        view[i] = buf[i]
    }
    return new Float32Array(buffer)
}

// data: Float32Array
// sampleRate: number
// filename: string
const exportWAV = (data, sampleRate, filename) => {
    const audioData = {
        sampleRate: sampleRate,
        channelData: [data]
    }
    WavEncoder.encode(audioData).then((buffer) => {
        fs.writeFile(filename, Buffer.from(buffer), (e) => {
            if (e) {
                console.log(e)
            } else {
                console.log(`Successfully saved ${filename}`)
            }
        })
    })
}

// RTPパケットのヘッダを作成
function createRtpHeader(payloadType, sequenceNumber, timestamp, ssrc) {
    const version = 2; // RTPバージョン
    const padding = 0; // パディングフラグ
    const extension = 0; // 拡張フラグ
    const csrcCount = 0; // CSRCカウント
  
    const header = Buffer.alloc(12);
    header[0] = (version << 6) | (padding << 5) | (extension << 4) | csrcCount;
    header[1] = payloadType & 0x7f;
    header[2] = (sequenceNumber >> 8) & 0xff;
    header[3] = sequenceNumber & 0xff;
    header[4] = (timestamp >> 24) & 0xff;
    header[5] = (timestamp >> 16) & 0xff;
    header[6] = (timestamp >> 8) & 0xff;
    header[7] = timestamp & 0xff;
    header[8] = (ssrc >> 24) & 0xff;
    header[9] = (ssrc >> 16) & 0xff;
    header[10] = (ssrc >> 8) & 0xff;
    header[11] = ssrc & 0xff;
  
    return header;
}

// PCMデータをRTPパケットに変換
function convertPcmToRtp(pcmData, packetSize) {
    const rtpHeader = createRtpHeader(rtpPayloadType, sequenceNumber, timestamp, ssrc);
    sequenceNumber++;
    timestamp += pcmData.length;
  
    const rtpPacket = Buffer.concat([rtpHeader, pcmData]);

    // パケットサイズが指定された値より大きい場合、切り詰める
    if (rtpPacket.length > packetSize) {
        return rtpPacket.slice(0, packetSize);
    }
  
    return rtpPacket;
}