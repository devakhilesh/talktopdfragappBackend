import app from "./src/app";
import { configEnv } from "./src/config";
import connectDB from "./src/db";


const startServer = async () => {
  const PORT = configEnv.PORT || 3000;

  // connect database
  await connectDB();


  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

 

startServer();
