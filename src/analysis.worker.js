import {createAnalysisEngine} from "./analysisTasks.js";
const execute=createAnalysisEngine();
self.onmessage=async ({data:{id,type,payload}})=>{
  let last=0,lastStage="";
  const report=(percent,stage)=>{
    const now=performance.now();
    if(stage!==lastStage||now-last>=60){
      self.postMessage({id,kind:"progress",percent,stage});last=now;lastStage=stage;
    }
  };
  try{const result=await execute(type,payload,report);self.postMessage({id,kind:"result",result});}
  catch(error){self.postMessage({id,kind:"error",error:error.message||"处理失败"});}
};
