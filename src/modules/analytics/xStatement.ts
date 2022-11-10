import {v4 as uuidv4} from 'uuid';

export class xStatement {
    public id: string;
    public timestamp: string;
    public stored: string;
    public actor: xActor;
    public verb: xVerb;
    public object: xObject;
    version: "2.0.0";
    constructor() {
      this.id = uuidv4();
      this.actor = new xActor();
      this.verb = new xVerb();
      this.object = new xObject();
    }
   
}

export class xActor {
  objectType: "Agent";
  public name: string = "";
  public mbox: string = "";
  constructor(){
    this.name = "online";
  }
}

export class xVerb {
  public id: string = "";
  public display: string = "";
}

export class xActivity {
  
}

export class xObject {
  public id: string;
  public type: string;
  public name: string;
}

   