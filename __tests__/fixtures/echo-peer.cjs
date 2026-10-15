// Deterministic read-only ECHONET peer. Every response echoes the request TID.
const dgram = require('node:dgram');
const profile = '0ef001', appliance = '013001';
function properties(eoj) {
  if (![profile, appliance].includes(eoj)) return {};
  const values = {
    '80': '30', '82': '00005000',
    '83': eoj === profile ? 'fefffffe00000000000000000000000001' : 'fefffffe00000000000000000000000002',
    '88': '42', '8a': 'fffffe', '9d': eoj === profile ? '01d5' : '00', '9e': '00'
  };
  if (eoj === profile) values.d6 = values.d5 = '01013001';
  const codes = [...Object.keys(values), '9f'];
  values['9f'] = codes.length.toString(16).padStart(2, '0') + codes.join('');
  return values;
}
function respond(packet) {
  if (packet.length < 14 || packet.subarray(0, 2).toString('hex') !== '1081' || packet[10] !== 0x62) return null;
  const eoj = packet.subarray(7, 10).toString('hex');
  const values = properties(eoj); const details = []; let offset = 12, refused = false;
  for (let i = 0; i < packet[11]; i++) {
    if (offset + 2 > packet.length) return null;
    const epc = packet[offset++], size = packet[offset++]; offset += size;
    if (offset > packet.length) return null;
    const key = epc.toString(16).padStart(2, '0');
    const value = Buffer.from(values[key] || '', 'hex');
    refused = refused || !(key in values);
    details.push(Buffer.from([epc, value.length]), value);
  }
  return Buffer.concat([
    packet.subarray(0, 4), packet.subarray(7, 10), packet.subarray(4, 7),
    Buffer.from([refused ? 0x52 : 0x72, packet[11]]), ...details
  ]);
}
module.exports = {respond};
if (require.main === module) {
  const socket = dgram.createSocket({type: 'udp4', reuseAddr: true});
  socket.on('message', (packet, remote) => {
    const reply = respond(packet);
    if (reply) socket.send(reply, 3610, remote.address);
  });
  socket.bind(3610, '0.0.0.0', () => {
    socket.addMembership('224.0.23.0'); socket.setMulticastLoopback(false);
    socket.send(Buffer.from('108100000ef0010ef0017301d50401013001', 'hex'), 3610, '224.0.23.0');
    console.log('Read-only ECHONET fixture ready: 013001');
  });
}
