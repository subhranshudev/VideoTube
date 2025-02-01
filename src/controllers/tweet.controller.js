import mongoose, {isValidObjectId} from "mongoose";
import { User } from "../models/user.models.js";
import { Tweet } from "../models/tweet.models.js";
import { asyncHandler } from "../utils/asynchandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const createTweet = asyncHandler( async (req, res) => {
    // get the comment content from frontend
    const { content } = req.body

    // check, if not empty
    if (!content) {
        throw new ApiError(400, "Please write something")
    }
    
    // get the owner of tweet
    const owner = req.user?._id

    // create the tweet
    try {
        const tweet = await Tweet.create({
            content: content,
            owner: owner

        })

        if (!tweet) {
            throw new ApiError(500, "Something went wrong while creating your tweet")  
        }

        return res.status(200).json( new ApiResponse(200, tweet, "Tweet created successfully"))
        
    } catch (error) {
        console.log("Tweet creation failed");
        
        throw new ApiError( 500, "Something went wrong while creating your tweet"); 
    }
})

const getUserTweets = asyncHandler( async (req, res) => {
    const { userId } = req.params;

    if (!isValidObjectId(userId)) {
      throw new ApiError(401, "Unauthorised");
    }
    
    const tweets = await Tweet.aggregate([
      {
        $match: {
          owner: new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "owner",
          foreignField: "_id",
          as: "owner",
          pipeline: [
            {
              $project: {
                username: 1,
                avatar: 1
              },
            },
          ],
        },
      },
      {
        $addFields:{
            owner: {
                $first: "$owner"
            }
        }
      }
    ]);

    console.log("tweets: ",tweets);
    

    return res.status(200).json( new ApiResponse(200, tweets, "Got the tweets of user successfully"))
})

const updateTweet = asyncHandler( async (req, res) => {
    const {tweetId} = req.params

    
    
    if (!isValidObjectId(tweetId)) {
      throw new ApiError(400, "Invalid tweet");
    }

    const tweet =  await Tweet.findById(tweetId)
    console.log("tweet:" ,tweet);
    
    if (!tweet) {
      throw new ApiError(400, "Tweet not found")
    }

    if (tweet?.owner.toString() !== req.user?._id.toString()) {
      throw new ApiError(400, "Only creator of this tweet can update it")
      
    }


    const {content} = req.body;
    console.log("content: ", content);
    
    if (!content) {
        throw new ApiError(400, "Please write something")
    }
    
    const newTweet = await Tweet.findByIdAndUpdate(
      tweetId,
      {
        $set: {
          content: content,
        },
      },
      { new: true }
    );
    
    return res
      .status(200)
      .json(new ApiResponse(200, newTweet, "Tweet updated successfully"));
})

const deleteTweet = asyncHandler( async (req, res) => {
    const {tweetId} = req.params
    console.log(tweetId);
  

    if (!isValidObjectId(tweetId)) {
      throw new ApiError(400, "Invalid Tweet");
    }

    const tweet = await Tweet.findById(tweetId)
    console.log(tweet);
    
    if (!tweet) {
      throw new ApiError(400, "Tweet not found" )
      
    }

    if (tweet?.owner.toString() !== req.user?._id.toString()) {
      throw new ApiError(400, "Only the Creator of this tweet can delete it")
    }

    await Tweet.findByIdAndDelete(tweetId)

    return res.status(200).json(new ApiResponse(200, {}, "Tweet deleted successfully"))
})
export { createTweet, getUserTweets, updateTweet, deleteTweet };