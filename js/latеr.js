class User {
  constructor(name) { this.name = name; }
}

const Types = { User };
const jsonString = '{"__type":"User","name":"Иван"}';

const userInstance = JSON.parse(jsonString, (key, value) => {
  if (key === '' && value && value.__type) {
    const TargetClass = Types[value.__type];
    if (TargetClass) {
      return Object.assign(new TargetClass(), value);
    }
  }
  return value;
});