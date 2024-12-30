import * as v from 'valibot';

const LoginSchema = v.object({
    email: v.pipe(v.string(), v.email()),
    password: v.pipe(v.string(),v.minLength(8)),
  });

type LoginData = v.InferOutput<typeof LoginSchema>; // { email: string; password: string }


// v.parse(LoginSchema, { email: '', password: '' });


const a = v.parse(LoginSchema, { email: 'jane@example.com', password: '12345678' });
trace(JSON.stringify(a))
