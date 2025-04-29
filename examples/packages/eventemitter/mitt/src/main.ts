import EventEmitter from 'mitt'

const ee = EventEmitter();
ee.on("boo", arg => trace(`event "boo" with argument ${arg}\n`)); 
ee.emit("boo", 2);