#! /usr/bin/env jest

import React from "react"
import { CollapsibleList, numItemsVisible } from "./CollapsibleList.js"
import { collapsibleListSampleItems } from "./CollapsibleList.sampleInput.js"

import enzyme from "enzyme"
import Adapter from "enzyme-adapter-react-16"
enzyme.configure({ adapter: new Adapter() })

describe("when you render a collapsible list", () => {
    test("something renders", () => {
        const view = enzyme.shallow(
            <CollapsibleList>{collapsibleListSampleItems}</CollapsibleList>
        )
        expect(view.find(".list-item")).not.toHaveLength(0)
    })
})

test("testing numItemsVisible utility function", () => {
    expect(numItemsVisible([], 10, 1)).toEqual(0)
    expect(numItemsVisible([1], 10, 1)).toEqual(1)

    expect(numItemsVisible([2], 10, 9)).toEqual(0)
    expect(numItemsVisible([1], 10, 9)).toEqual(1)

    expect(numItemsVisible([5, 5, 5], 15, 0)).toEqual(3)
    expect(numItemsVisible([5, 5, 5], 15, 1)).toEqual(2)

    expect(numItemsVisible([5, 5, 5], 0, 1)).toEqual(0)
})
