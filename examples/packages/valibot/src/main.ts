import {object, string, email, pipe, minLength, InferOutput, parse} from 'valibot';

const LoginSchema = object({
    email: pipe(string(), email()),
    password: pipe(string(),minLength(8)),
  });

type LoginData = InferOutput<typeof LoginSchema>; // { email: string; password: string }


// v.parse(LoginSchema, { email: '', password: '' });


const a = parse(LoginSchema, { email: 'jane@example.com', password: '12345678' });
trace(JSON.stringify(a))
