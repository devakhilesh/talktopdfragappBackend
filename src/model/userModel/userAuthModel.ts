import mongoose from "mongoose"
import { userAuth } from "../../types/userTypes"


const userAuthSchema = new mongoose.Schema<userAuth>({
    name:{
        type:String,
        required:true
    },
        email:{
        type:String,
        required:true
    },
        password:{
        type:String,
        required:true
    },
        role:{
        type:String,
        default:"user"
    }
},{timestamps:true})


const userModel = mongoose.model<userAuth>("user",userAuthSchema)

export default userModel