import mongoose, {isValidObjectId} from "mongoose";
import { User } from "../models/user.models.js";
import { Subscription } from "../models/subscription.models.js";
import { asyncHandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/ApiError.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const toggleSubscription = asyncHandler( async (req, res) => {
    const { channelId } = req.params
    if (!isValidObjectId(channelId)) {
        throw new ApiError("Invalid Channel Id")
    }

    // check channel is available or not
    const channel = await User.findById(channelId)
    if (!channel) {
        throw new ApiError(404, "Channel not found")
    }

    //check channel is subscribed or not
    const isSubscribed = await Subscription.findOne({
      subscriber: req.user?._id,
      channel: channelId
    });

    //if subscribed then toggle to unsubscribe
    if (isSubscribed) {
        await Subscription.findByIdAndDelete(isSubscribed._id)

        return res.status(200).json( new ApiResponse(200, {}, "Channel Unsubscribed"))
    }

    // if not subscribed then toggle to subscribe
    const subscribed = await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId
    });

    if(!subscribed){
        throw new ApiError(500, "Error in subscribing")
    }

    return res.status(200).json( new ApiResponse(200, subscribed, "Channel Subscribed successfully"))

})

const getUserChannelSubscribers = asyncHandler( async (req, res) => {
    const { channelId } = req.params;
  
    console.log(channelId);
    
    if (!isValidObjectId(channelId)) {
      throw new ApiError("Invalid Channel Id");
    }

    const subscribers = await Subscription.aggregate([
      {
        $match: {
          channel: new mongoose.Types.ObjectId(channelId),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "subscriber",
          foreignField: "_id",
          as: "subscriber",
          pipeline:[
            { 
                $project:{
                    username: 1,
                    fullname: 1,
                    avatar: 1,
                    coverImage: 1
                }
            }
          ]
        },
      },
      {
        $addFields: {
          subscriber: {
            $first: "$subscriber",
          },
        },
      },
      {
        $project: {
          channel: 0
        },
      },
    ]);

    console.log(subscribers);

    if (subscribers.length === 0) {
        throw new ApiError(404, "No subscribers found")
    }

    return res.status(200).json( new ApiResponse(200, subscribers, "Subscribers fetched successfully"))

})

const getSubscribedChannels = asyncHandler( async (req, res) => {
    const { subscriberId } = req.params
//console.log(subscriberId);

    if (!isValidObjectId(subscriberId)) {
      throw new ApiError(400, "Invalid Id")
    }

    if (subscriberId.toString() !== req.user?._id.toString()) {
      throw new ApiError(402, "Only owner can get the subscribed channels")
    }

    const subscribedChannels = await Subscription.aggregate([
      {
        $match: {
          subscriber: new mongoose.Types.ObjectId(subscriberId),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "channel",
          foreignField: "_id",
          as: "channel",
          pipeline: [
            {
              $project: {
                username: 1,
                fullname: 1,
                avatar: 1,
                coverImage: 1,
              },
            },
          ],
        },
      },
      {
        $addFields: {
          channel: {
            $first: "$channel",
          },
        },
      },
    ]);

    if (subscribedChannels.length === 0) {
      throw new ApiError(404, "No channel subscribed yet")
    }

    return res.status(200).json( new ApiResponse(200, subscribedChannels, "Subscribed channels fetched successfully"))



})


export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };