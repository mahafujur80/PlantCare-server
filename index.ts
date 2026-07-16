import express, { Application, NextFunction, Request, Response } from "express";
import { MongoClient, ObjectId, ServerApiVersion } from "mongodb";
import cors from "cors";
import dotenv from "dotenv";
import { createRemoteJWKSet, jwtVerify } from "jose";

dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());



// Lazy JWKS initialization to prevent crash if CLIENT_URL_FOR_JWT is not set
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  if (!_jwks) {
    if (!process.env.CLIENT_URL_FOR_JWT) {
      throw new Error('CLIENT_URL_FOR_JWT environment variable is not set');
    }
    _jwks = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL_FOR_JWT}/api/auth/jwks`)
    );
  }
  return _jwks;
}

const verifyToken = async (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const jwks = getJWKS();
    await jwtVerify(token, jwks);
    next();
  } catch {
    return res.status(403).json({ message: 'Forbidden' });
  }
};



const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI environment variable is not set!');
}

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = uri ? new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
}) : null;

const plantDB = client?.db("PlantCare");
const plantCollection = plantDB?.collection("Plants");


  // user operations
  app.post('/api/plant/new', verifyToken, async (req: Request, res: Response) => {
    try{
      const data = req.body;
      const newPlant = {
        ...data,
        createdAt: new Date(),
      }
      const result = await plantCollection?.insertOne(newPlant);
      res.status(201).json({
        result,
        success: true,
        message: 'Plant added successfully',
      });
    }catch(error){
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  });
  // get all plants 
 app.get("/api/plants", async (req: Request, res: Response) => {
  try {
    const { search, category, careLevel, sortBy, page =1, limit =8 } = req.query;

    const filter: any = {};

    // Search
    if (search) {
      filter.$or = [
        { title: { $regex: search as string, $options: "i" } },
        { shortDescription: { $regex: search as string, $options: "i" } },
        { description: { $regex: search as string, $options: "i" } },
        { location: { $regex: search as string, $options: "i" } },
      ];
    }

    // Category Filter
    if (category && category !== "All") {
      filter.category = category;
    }

    // Care Level Filter
    if (careLevel && careLevel !== "All") {
      filter.careLevel = careLevel;
    }

    // Sort
    let sortOption: any = { createdAt: -1 };

    if (sortBy === "newest") {
      sortOption = { createdAt: -1 };
    }

    if (sortBy === "oldest") {
      sortOption = { createdAt: 1 };
    }

    // Pagination
    const total = await plantCollection?.countDocuments(filter) ?? 0;
    const skip = (Number(page) - 1) * Number(limit);
    const totalPage = Math.ceil(total / Number(limit));

    const plants = await plantCollection
      ?.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(Number(limit))
      .toArray() ?? [];

    res.json({data: plants, page: Number(page), totalPage});
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch plants",
      error: error instanceof Error ? error.message : String(error),
      dbConnected: !!client,
      collectionExists: !!plantCollection,
      plants: [],
      total: 0,
    });
  }
});

// get a single plant by id
app.get('/api/plant/:id', async (req: Request, res: Response) =>{
  try {
    const { id } = req.params;
    const plant = await plantCollection?.findOne({_id: new ObjectId(id as string)});
    res.json(plant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch plant' });
  }
});

// get trending plants 
app.get('/api/plants/trending', async (req: Request, res: Response)=>{
  try {
    const result = await plantCollection?.find().limit(4).toArray();
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch trending plants' });
  }
})


// get my added plants by userId 
 app.get('/api/my/plants', verifyToken, async (req: Request, res: Response) =>{
  try {
    const { userId } = req.query;
    const plant = await plantCollection?.find({userId: userId as string}).toArray();
    res.json(plant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to fetch user plants' });
  }
});
// Delete user her plant
app.delete('/api/delete/plant', verifyToken, async (req: Request, res: Response) =>{
  try {
    const {userId, id} = req.query;
    const plant = await plantCollection?.deleteOne({userId: userId as string, _id: new ObjectId(id as string)});
    res.json(plant);
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to delete plant' });
  }
});


if (client) {
  client
    .connect()
    .then(async () => {
      await client.db("admin").command({ ping: 1 });
      console.log("Pinged your deployment. You successfully connected to MongoDB!");
    })
    .catch(console.error);
}



// home route
app.get("/", (req: Request, res: Response) => {
  res.send("hello there! this is a plant care server! 🚀");
});

// Start a listener locally; Vercel imports the exported app as a function.
if (!process.env.VERCEL) {
app.listen(PORT, () => {
  console.log(`server is live http://localhost:${PORT} port 🔥`);
});
}

export default app;
