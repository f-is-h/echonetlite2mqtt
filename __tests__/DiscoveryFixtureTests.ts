import 'jest';
const {respond} = require('./fixtures/echo-peer.cjs');

test('discovery fixture preserves request TID and reverses object addresses',()=>{
  const request=Buffer.from('1081beef0ef0010ef0016201d600','hex');const reply:Buffer=respond(request);
  expect(reply.subarray(0,4)).toEqual(request.subarray(0,4));
  expect(reply.toString('hex')).toBe('1081beef0ef0010ef0017201d60401013001');
});
test('appliance GET and explicit refusal both echo the current transaction',()=>{
  expect(respond(Buffer.from('1081004205ff0101300162018000','hex')).toString('hex')).toBe('1081004201300105ff017201800130');
  expect(respond(Buffer.from('1081004305ff010130016201ff00','hex')).toString('hex')).toBe('1081004301300105ff015201ff00');
});
test('read-only fixture never responds to SET requests',()=>{
  expect(respond(Buffer.from('1081004405ff010130016101800130','hex'))).toBeNull();
});
