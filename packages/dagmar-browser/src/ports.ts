/** Host transport owns URL mapping, current authorization and CSRF. */
export type DagmarRequest = <T>(path:string,method?:string,body?:unknown,signal?:AbortSignal,headers?:Record<string,string>)=>Promise<T>;
