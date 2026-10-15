import 'jest';
import EL from 'echonet-lite';
import {CommandResponse, EchoNetCommunicator, ELSV, Response} from '../server/EchoNetCommunicator';

const command = {ip:'192.168.11.168', seoj:'05ff01', deoj:'027c01', esv:ELSV.GET, epc:'c4', edt:'', tid:'1234'};
const response = (change: any = {}):Response => ({rinfo:{address:command.ip} as any, els:{SEOJ:command.deoj, DEOJ:command.seoj, TID:'1234', ESV:ELSV.GET_RES, DETAILs:{c4:'0190'}, ...change} as any});

describe('ECHONET command correlation',()=>{
  test('GET_SNA completes promptly and retains the empty field as unavailable',()=>{
    const r=new CommandResponse(command), done=jest.fn();r.setCallback(done);
    r.addResponse(response({ESV:ELSV.GET_SNA, DETAILs:{c4:''}}));
    expect(done).toHaveBeenCalledTimes(1);expect(r.responses[0].els.DETAILs.c4).toBe('');
  });
  test.each([
    {TID:'1233'}, {DETAILs:{cc:'01c2'}}, {DEOJ:'0ef001'}, {SEOJ:'027c02'}, {ESV:ELSV.INF}
  ])('does not complete on an unrelated response %j',change=>{
    const r=new CommandResponse(command), done=jest.fn();r.setCallback(done);
    r.addResponse(response(change));expect(done).not.toHaveBeenCalled();expect(r.responses).toHaveLength(0);
  });
  test('accepts valid matching GET',()=>{
    const r=new CommandResponse(command),done=jest.fn();r.setCallback(done);r.addResponse(response());expect(done).toHaveBeenCalledTimes(1);
  });
  test('keeps SetC response behavior',()=>{
    const r=new CommandResponse({...command,esv:ELSV.SETC}),done=jest.fn();r.setCallback(done);
    r.addResponse(response({ESV:ELSV.SET_RES,DETAILs:{c4:''}}));expect(done).toHaveBeenCalledTimes(1);
  });
  test('overlapping discovery and polling retain separate collectors and accept out-of-order replies',async()=>{
    const spy=jest.spyOn(EL,'sendOPC1').mockReturnValueOnce([0x12,0x34]).mockReturnValueOnce([0x12,0x35]);
    const a=EchoNetCommunicator.execCommandPromise(command.ip,command.seoj,command.deoj,command.esv,command.epc,'');
    const b=EchoNetCommunicator.execCommandPromise(command.ip,command.seoj,command.deoj,command.esv,'cc','');
    expect(EchoNetCommunicator.commandResponses.size).toBe(2);
    const second=response({TID:'1235',DETAILs:{cc:'01c2'}});EchoNetCommunicator.echonetUserFunc(second.rinfo,second.els);
    expect((await b).responses[0].els.DETAILs.cc).toBe('01c2');expect(EchoNetCommunicator.commandResponses.size).toBe(1);
    const first=response();EchoNetCommunicator.echonetUserFunc(first.rinfo,first.els);
    expect((await a).responses[0].els.DETAILs.c4).toBe('0190');expect(EchoNetCommunicator.commandResponses.size).toBe(0);spy.mockRestore();
  });
  test('timeout discards its collector; late reply cannot clear a newer request', async()=>{
    jest.useFakeTimers(); const spy=jest.spyOn(EL,'sendOPC1').mockReturnValue([0x12,0x34]);
    EchoNetCommunicator.commandTimeout=100;
    const first=EchoNetCommunicator.execCommandPromise(command.ip,command.seoj,command.deoj,command.esv,command.epc,'');
    const old=EchoNetCommunicator.commandResponse!;const rejection=expect(first).rejects.toMatchObject({message:'timeout'});
    jest.advanceTimersByTime(100);await rejection;expect(EchoNetCommunicator.commandResponse).toBeUndefined();
    const second=EchoNetCommunicator.execCommandPromise(command.ip,command.seoj,command.deoj,command.esv,command.epc,'');
    const current=EchoNetCommunicator.commandResponse;
    old.addResponse(response());expect(EchoNetCommunicator.commandResponse).toBe(current);
    current!.addResponse(response());await second;expect(EchoNetCommunicator.commandResponse).toBeUndefined();
    spy.mockRestore();jest.useRealTimers();
  });
});
