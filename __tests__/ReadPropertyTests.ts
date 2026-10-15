import 'jest';
import {EchoNetLiteController} from '../server/EchoNetLiteController';
import {CommandResponse, ELSV} from '../server/EchoNetCommunicator';

const id:any={ip:'192.168.11.168',eoj:'027c01',id:'fuel',internalId:'fuel'};
const response=(esv:string,raw:string)=>{
  const r=new CommandResponse({ip:id.ip,seoj:'05ff01',deoj:id.eoj,esv:ELSV.GET,epc:'c4',edt:'',tid:'0001'});
  r.responses.push({rinfo:{address:id.ip} as any,els:{ESV:esv,DETAILs:{c4:raw}} as any});return r;
};
const makeController=()=>{
  const c:any=new EchoNetLiteController('',{aliases:[]} as any,false,false,[],false,3000,
    ()=>({properties:[{name:'power',epc:'0xC4'}]}) as any,()=>undefined,[]);
  c.deviceConverter={convertPropertyValue:jest.fn((_p,raw)=>parseInt(raw,16))};
  c.firePropertyChnagedEvent=jest.fn();return c;
};

describe('read-only polling',()=>{
  test('explicit PDC=0 does not retry or publish zero',async()=>{
    const c=makeController();const exec=jest.fn().mockResolvedValue(response(ELSV.GET_SNA,''));c.echonetLiteRawController={execPromise:exec};
    await c.requestDeviceProperty(id,'power');expect(exec).toHaveBeenCalledTimes(1);
    expect(c.deviceConverter.convertPropertyValue).not.toHaveBeenCalled();expect(c.firePropertyChnagedEvent).not.toHaveBeenCalled();
  });
  test('accepts a valid field in a partial GET_SNA',async()=>{
    const c=makeController();c.echonetLiteRawController={execPromise:jest.fn().mockResolvedValue(response(ELSV.GET_SNA,'0190'))};
    await c.requestDeviceProperty(id,'power');expect(c.firePropertyChnagedEvent).toHaveBeenCalledWith(id.ip,id.eoj,'power',400);
  });
  test('overlapping identical reads share one GET and release after completion',async()=>{
    const c=makeController();let complete!:(r:CommandResponse)=>void;
    const pending=new Promise<CommandResponse>(r=>complete=r);const exec=jest.fn().mockReturnValueOnce(pending).mockResolvedValue(response(ELSV.GET_RES,'0190'));
    c.echonetLiteRawController={execPromise:exec};const a=c.requestDeviceProperty(id,'power');const b=c.requestDeviceProperty(id,'power');
    expect(a).toBe(b);expect(exec).toHaveBeenCalledTimes(1);complete(response(ELSV.GET_RES,'0190'));await Promise.all([a,b]);
    await c.requestDeviceProperty(id,'power');expect(exec).toHaveBeenCalledTimes(2);
  });
  test('a true lost reply gets one bounded retry',async()=>{
    const c=makeController();const empty=new CommandResponse({ip:id.ip,seoj:'05ff01',deoj:id.eoj,esv:ELSV.GET,epc:'c4',edt:'',tid:'0001'});
    const exec=jest.fn().mockResolvedValueOnce(empty).mockResolvedValueOnce(response(ELSV.GET_RES,'0190'));c.echonetLiteRawController={execPromise:exec};
    await c.requestDeviceProperty(id,'power');expect(exec).toHaveBeenCalledTimes(2);expect(c.firePropertyChnagedEvent).toHaveBeenCalledTimes(1);
    expect(exec.mock.calls.every(x=>x[0].esv==='62')).toBe(true);
  });
});
