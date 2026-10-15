import {useCallback,useEffect,useRef,useState} from "react";

export function useProcessingTask() {
  const [task,setTask]=useState(null);
  const workerRef=useRef(null),pendingRef=useRef(null),sequenceRef=useRef(0),busyRef=useRef(false);
  useEffect(()=>()=>{
    workerRef.current?.terminate();workerRef.current=null;
    pendingRef.current?.reject(new Error("处理已结束"));pendingRef.current=null;
  },[]);
  const runTask=useCallback(async(title,type,payload,commit)=>{
    if(busyRef.current)return;
    busyRef.current=true;
    const id=++sequenceRef.current,started=performance.now();
    setTask({title,stage:"准备处理任务",percent:null,started});
    try {
      // Paint the processing surface before dispatching work or serializing data.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      let result;
      if(typeof type==="function"){
        result=await type((percent,stage)=>setTask(prev=>prev?{...prev,percent,stage}:prev));
      }else{
      if(!workerRef.current){
        const worker=new Worker(new URL("./analysis.worker.js",import.meta.url),{type:"module"});
        worker.onmessage=({data:message})=>{
          const pending=pendingRef.current;if(!pending||message.id!==pending.id)return;
          if(message.kind==="progress")setTask(prev=>prev?{...prev,stage:message.stage,percent:message.percent===null?null:Math.max(prev.percent??0,Math.min(99,message.percent))}:prev);
          else{pendingRef.current=null;message.kind==="error"?pending.reject(new Error(message.error)):pending.resolve(message.result);}
        };
        worker.onerror=event=>{
          pendingRef.current?.reject(new Error(event.message||"后台计算失败，请重新导入数据"));pendingRef.current=null;
          worker.terminate();workerRef.current=null;
        };
        workerRef.current=worker;
      }
      result=await new Promise((resolve,reject)=>{
        pendingRef.current={id,resolve,reject};
        try{workerRef.current.postMessage({id,type,payload});}catch(error){pendingRef.current=null;reject(error);}
      });
      }
      commit?.(result);
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      setTask(prev=>prev?{...prev,percent:100,stage:"处理完成",complete:true}:prev);
      await new Promise(resolve=>setTimeout(resolve,450));
      return result;
    }finally{busyRef.current=false;setTask(null);}
  },[]);
  return {task,runTask,isProcessing:!!task};
}

export function ProcessingProgress({task,theme="dark"}) {
  const [elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    if(!task){setElapsed(0);return;}
    const update=()=>setElapsed(Math.floor((performance.now()-task.started)/1000));
    update();const timer=setInterval(update,1000);return()=>clearInterval(timer);
  },[task?.started]);
  if(!task)return null;
  const percent=task.percent===null?null:Math.floor(task.percent);
  return <div className={`processing-overlay processing-${theme}`}>
    <section className="processing-panel" aria-label={task.title}>
      <div className="processing-grid" aria-hidden="true"/>
      <div className="processing-topline"><span><i/>{task.complete?"COMPLETED":"FOREST COMPUTING"}</span><span>LOCAL ENGINE</span></div>
      <div className="processing-heading"><div className={`processing-orbit${task.complete?" complete":""}`} aria-hidden="true"><span/>{task.complete?"✓":"⌘"}</div><div><h2>{task.title}</h2><p role="status" aria-live="polite">{task.stage}</p></div><b>{percent===null?"···":percent}<small>{percent===null?"运行中":"%"}</small></b></div>
      <div className={`processing-track${percent===null?" indeterminate":""}`} role="progressbar" aria-label={`${task.title}阶段进度`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent??undefined} aria-valuetext={percent===null?`${task.stage}，正在处理`:`${task.stage}，阶段进度 ${percent}%`}><div className="processing-fill" style={{width:percent===null?"35%":`${percent}%`}}/><div className="processing-ticks" aria-hidden="true"/></div>
      <div className="processing-bottomline"><span className="processing-signal" aria-hidden="true"><i/><i/><i/><i/><i/></span><span>{task.complete?"计算结果已就绪":"系统正在运算，请稍候"}</span><time>已用时 {elapsed}s</time></div>
    </section>
  </div>;
}
