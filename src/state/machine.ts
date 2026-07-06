export type AppScreen='INTRO'|'REQUESTING_PERMISSION'|'CALIBRATING'|'LIVE'|'PAUSED'|'DENIED'|'UNSUPPORTED'|'SUMMARY';
export type State={screen:AppScreen};
export type Action={type:'CONTINUE'}|{type:'GRANTED'}|{type:'DENIED'}|{type:'UNSUPPORTED'}|{type:'CALIBRATED'}|{type:'PAUSE'}|{type:'RESUME'}|{type:'END'}|{type:'NEW_TRIP'};
export const initialState:State={screen:'INTRO'};
export function reducer(state:State,action:Action):State {
  switch(action.type){case'CONTINUE':return{screen:'REQUESTING_PERMISSION'};case'GRANTED':return{screen:'CALIBRATING'};case'DENIED':return{screen:'DENIED'};case'UNSUPPORTED':return{screen:'UNSUPPORTED'};case'CALIBRATED':case'RESUME':return{screen:'LIVE'};case'PAUSE':return{screen:'PAUSED'};case'END':return{screen:'SUMMARY'};case'NEW_TRIP':return{screen:'CALIBRATING'};default:return state;}
}
