import EventEmitter from "@moddable/eventemitter3";
import TypedEmitter from "typed-emitter"

type MessageEvents = {
    error: (error: Error) => void,
    message: (body: string, from: string) => void
}

const messageEmitter = new EventEmitter() as TypedEmitter<MessageEvents>

messageEmitter.on("message", (body, from) => {
    trace(`event "message" with body ${body} from ${from}\n`)
});

messageEmitter.emit("message", "hello", "world");
