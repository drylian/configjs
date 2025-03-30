import { ConfigJS } from "./src/ConfigJS";
import envDriver from "./src/libs/drivers/env-driver";
import { c } from "./src/libs/factory";

const Config = new ConfigJS(envDriver, {
  app:{
    mode:c.string().prop("TEST_KEY"),
    test:c.string().prop("TEST_KEY")
  },
});
Config.load({
  processEnv:true
});

console.log(Config.get("app.test")); // undefined

Config.set("app.mode", "Novo valor");
console.log(Config.get("app.mode")); // Novo valor
const teste = Config.get("app.mode");
const conf = Config.conf("app.mode");
console.log(conf, process.env[conf.prop]); // Novo valor
process.env[conf.prop] = "Novo valor2";
console.log(conf, process.env[conf.prop]); // Novo valor2
console.log(Config.get("app.mode")); // Novo valor2
Config.del("app.mode"); // deixa TEST_KEY=  no env, undefined
